/**
 * Reads a Notion page into the normalized model, children included.
 *
 * Depth and block count are capped. A page that exceeds either is still
 * returned — truncated, with the truncation recorded — because refusing to
 * audit a large page is less useful than auditing the part that fits.
 */

import { Client, isFullBlock, isFullPage } from "@notionhq/client";
import type { BlockObjectResponse, PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";

import type { PolishBlock, PolishPage, PropertyFormula } from "@/core/types";

import { fromNotionBlock, fromNotionPage } from "./map";
import { createPacer } from "./pace";

export const MAX_DEPTH = 4;
export const MAX_BLOCKS = 400;

export type ReadLimits = {
  truncated: boolean;
  reason?: "depth" | "count";
  blockCount: number;
};

export type ReadResult = {
  page: PolishPage;
  limits: ReadLimits;
};

export function createNotionClient(auth: string): Client {
  return new Client({ auth, retry: { maxRetries: 3 } });
}

export async function searchPages(client: Client, query: string) {
  const paced = createPacer();
  const response = await paced(() =>
    client.search({
      query,
      filter: { property: "object", value: "page" },
      page_size: 8,
    }),
  );

  return response.results.flatMap((result) => {
    if (!isFullPage(result)) return [];
    let title = "未命名";
    for (const property of Object.values(result.properties)) {
      if (property.type === "title") {
        title = property.title.map((item) => item.plain_text).join("") || title;
      }
    }
    return [{ id: result.id, title, url: result.url }];
  });
}

export async function readPage(client: Client, pageId: string, maxBlocks = MAX_BLOCKS): Promise<ReadResult> {
  const paced = createPacer();
  const limits: ReadLimits = { truncated: false, blockCount: 0 };

  const retrieved = await paced(() => client.pages.retrieve({ page_id: pageId }));
  if (!isFullPage(retrieved)) {
    throw new Error("页面返回的是部分对象。把页面分享给这个 integration 后再试。");
  }

  const blocks = await readChildren(client, paced, pageId, 0, limits, maxBlocks);
  const page = fromNotionPage(retrieved, blocks);
  await attachPropertyFormulas(client, paced, page, retrieved);
  return { page, limits };
}

/**
 * Database formula expressions live on the data source, not on the page.
 * A failure here does not fail the read: the page value can still be `unsupported`.
 */
async function attachPropertyFormulas(
  client: Client,
  paced: Paced,
  page: PolishPage,
  retrieved: PageObjectResponse,
): Promise<void> {
  const formulas: PropertyFormula[] = [];
  for (const [name, property] of Object.entries(retrieved.properties)) {
    if (property.type !== "formula") continue;
    formulas.push({
      name,
      expression: "",
      valueUnsupported: property.formula.type === "unsupported",
    });
  }

  const parent = retrieved.parent;
  try {
    if (parent.type === "data_source_id") {
      const source = await paced(() => client.dataSources.retrieve({ data_source_id: parent.data_source_id }));
      fillExpressions(formulas, source.properties);
    } else if (parent.type === "database_id") {
      const database = await paced(() => client.databases.retrieve({ database_id: parent.database_id }));
      if ("properties" in database && database.properties && typeof database.properties === "object") {
        fillExpressions(formulas, database.properties as Record<string, { type: string; formula?: { expression?: string } }>);
      }
    }
  } catch {
    // The computed value is still on the page. The expression stays blank.
  }

  if (formulas.length > 0) page.propertyFormulas = formulas;
}

function fillExpressions(
  formulas: PropertyFormula[],
  properties: Record<string, { type: string; formula?: { expression?: string } }>,
): void {
  for (const formula of formulas) {
    const config = properties[formula.name];
    if (config?.type === "formula" && config.formula?.expression) {
      formula.expression = config.formula.expression;
    }
  }
}

type Paced = ReturnType<typeof createPacer>;

async function readChildren(
  client: Client,
  paced: Paced,
  blockId: string,
  depth: number,
  limits: ReadLimits,
  maxBlocks = MAX_BLOCKS,
): Promise<PolishBlock[]> {
  const out: PolishBlock[] = [];
  let cursor: string | undefined;

  do {
    const response = await paced(() =>
      client.blocks.children.list({ block_id: blockId, start_cursor: cursor, page_size: 100 }),
    );

    for (const item of response.results) {
      if (!isFullBlock(item)) continue;
      if (limits.blockCount >= maxBlocks) {
        limits.truncated = true;
        limits.reason = "count";
        return out;
      }
      limits.blockCount += 1;
      out.push(await withChildren(client, paced, item, depth, limits, maxBlocks));
    }

    cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return out;
}

async function withChildren(
  client: Client,
  paced: Paced,
  block: BlockObjectResponse,
  depth: number,
  limits: ReadLimits,
  maxBlocks = MAX_BLOCKS,
): Promise<PolishBlock> {
  const mapped = fromNotionBlock(block);
  if (!block.has_children) return mapped;

  if (depth + 1 >= MAX_DEPTH) {
    limits.truncated = true;
    limits.reason ??= "depth";
    return mapped;
  }

  mapped.children = await readChildren(client, paced, block.id, depth + 1, limits, maxBlocks);
  return mapped;
}
