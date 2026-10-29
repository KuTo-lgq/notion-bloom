/**
 * Last mile. A draft is written only under the parent the caller names.
 * A failing content gate is not published unless the caller asks for human review.
 * Bloom never runs on a failing gate.
 *
 * 跳步 = Fail
 * 无推导的复杂公式 = Fail
 * 内容未过关就美化 = Fail
 */

import { readFile } from "node:fs/promises";

import type { BlockObjectRequest } from "@notionhq/client/build/src/api-endpoints";
import { isFullPage, type Client } from "@notionhq/client";

import { diffAfterBeautify } from "@/core/content-diff";
import { setHandoff } from "@/core/handoff";
import { proposePlan } from "@/core/planner";
import type { PolishPage } from "@/core/types";
import { applyToNotion, restoreSnapshot } from "@/notion/apply";
import { createPacer } from "@/notion/pace";
import { createNotionClient, readPage } from "@/notion/read";

import { LECTURE_COVER } from "@/core/themes";

import { draftToBlocks, humanReviewBlocks, type PublishBlock } from "./blocks";
import { refuseBeautify, reviewContent } from "./gate";
import { QUALITY_FAIL } from "./quality";
import type { LectureDraft } from "./types";

export function compactId(id: string): string {
  return id.replace(/-/g, "").toLowerCase();
}

/** Pages listed in NOTION_BLOOM_DENY are never publish or bloom targets. Default is empty. */
export function deniedPageIds(): string[] {
  return (process.env.NOTION_BLOOM_DENY ?? "")
    .split(/[\s,]+/)
    .map((id) => compactId(id))
    .filter((id) => id.length > 0);
}

export function assertNotForbidden(pageId: string): void {
  if (deniedPageIds().includes(compactId(pageId))) {
    throw new Error("Refusing: that page is listed in NOTION_BLOOM_DENY and is not written.");
  }
}

/** Publish only under the parent the operator named. There is no built-in page id. */
export function assertPublishParent(parentPageId: string, allowedParentId: string): void {
  assertNotForbidden(parentPageId);
  if (!allowedParentId.trim()) {
    throw new Error("Set NOTION_PARENT_PAGE_ID to the page that may receive new children.");
  }
  assertNotForbidden(allowedParentId);
  if (compactId(parentPageId) !== compactId(allowedParentId)) {
    throw new Error("Refusing: parent does not match NOTION_PARENT_PAGE_ID.");
  }
}

/** A failed upload becomes 【图缺】. The rest of the page still writes. */
export function blocksAfterUpload(blocks: PublishBlock[], failedFiles: ReadonlySet<string>): PublishBlock[] {
  return blocks.flatMap((block) => {
    if (block.type === "image" && failedFiles.has(block.file)) {
      return [{ type: "paragraph" as const, text: `【图缺】截图未能上传。原图在本地：${block.file}` }];
    }
    return [block];
  });
}

export type CreatedPage = { id: string; url: string };

export type PageWriter = {
  createPage(input: { parentPageId: string; title: string; blocks: PublishBlock[] }): Promise<CreatedPage>;
};

export function publishTitle(draft: LectureDraft): string {
  return draft.title.slice(0, 180);
}

/** Local bloom preview. It does not write. A failing gate never reaches it. */
export function dryRunBloom(draft: LectureDraft): { allowed: boolean; reason: string; ops: number } {
  const gate = reviewContent(draft);
  const decision = refuseBeautify(gate);
  if (!decision.allowed) return { allowed: false, reason: decision.reason, ops: 0 };
  const page: PolishPage = {
    id: "draft",
    title: publishTitle(draft),
    blocks: draftToBlocks(draft).map((block, index) => ({
      id: `b-${index}`,
      type: block.type === "toc" ? "table_of_contents" : block.type === "equation" ? "equation" : block.type === "image" ? "image" : block.type === "table" ? "paragraph" : block.type,
      richText: block.type === "table" ? [{ text: [block.headers.join(" | "), ...block.rows.map((row) => row.join(" | "))].join("\n") }] : "text" in block ? [{ text: block.text }] : undefined,
      expression: block.type === "equation" ? block.expression : undefined,
      url: block.type === "image" ? "https://example.com/slide.png" : undefined,
    })),
  };
  const plan = proposePlan(page, { themeId: "clean-docs" });
  return { allowed: true, reason: decision.reason, ops: plan.ops.length };
}

function textItem(content: string) {
  return [{ type: "text" as const, text: { content: content.slice(0, 1800) } }];
}

function richItems(content: string) {
  const parts = content.split(/(\$[^$]+\$)/g).filter((part) => part.length > 0);
  if (parts.length === 0) return textItem("");
  return parts.map((part) => {
    if (part.startsWith("$") && part.endsWith("$") && part.length > 2) {
      return { type: "equation" as const, equation: { expression: part.slice(1, -1).slice(0, 1800) } };
    }
    return { type: "text" as const, text: { content: part.slice(0, 1800) } };
  });
}

export function toNotionRequest(block: PublishBlock, uploadIds: Map<string, string>): BlockObjectRequest | null {
  switch (block.type) {
    case "callout":
      return {
        type: "callout",
        callout: {
          rich_text: textItem(block.text),
          icon: { type: "emoji", emoji: block.emoji },
          color: block.color,
        },
      };
    case "toc":
      return { type: "table_of_contents", table_of_contents: { color: "gray" } };
    case "heading_1":
      return { type: "heading_1", heading_1: { rich_text: textItem(block.text) } };
    case "heading_2":
      return { type: "heading_2", heading_2: { rich_text: textItem(block.text) } };
    case "paragraph":
      return { type: "paragraph", paragraph: { rich_text: textItem(block.text) } };
    case "numbered_list_item":
      return { type: "numbered_list_item", numbered_list_item: { rich_text: textItem(block.text) } };
    case "equation":
      return { type: "equation", equation: { expression: block.expression } };
    case "table": {
      const width = block.headers.length;
      const lines = [block.headers, ...block.rows].map((row) => {
        const cells = row.slice(0, width);
        while (cells.length < width) cells.push("");
        return {
          type: "table_row" as const,
          table_row: { cells: cells.map((cell) => richItems(cell)) },
        };
      });
      return {
        type: "table",
        table: {
          table_width: width,
          has_column_header: true,
          has_row_header: false,
          children: lines,
        },
      };
    }
    case "image": {
      const uploadId = uploadIds.get(block.file);
      if (!uploadId) return null;
      return {
        type: "image",
        image: {
          type: "file_upload",
          file_upload: { id: uploadId },
          caption: textItem(block.caption),
        },
      };
    }
    default: {
      const exhaustive: never = block;
      return exhaustive;
    }
  }
}

async function uploadImage(client: Client, paced: ReturnType<typeof createPacer>, file: string): Promise<string> {
  const bytes = await readFile(file);
  const filename = file.split("/").pop() ?? "slide.png";
  const contentType = filename.endsWith(".png") ? "image/png" : "image/jpeg";
  const created = await paced(() => client.fileUploads.create({ mode: "single_part", filename, content_type: contentType }));
  await paced(() =>
    client.fileUploads.send({
      file_upload_id: created.id,
      file: { filename, data: new Blob([new Uint8Array(bytes)], { type: contentType }) },
    }),
  );
  return created.id;
}

export function notionWriter(client: Client): PageWriter {
  const paced = createPacer();
  return {
    async createPage({ parentPageId, title, blocks }) {
      assertPublishParent(parentPageId, parentPageId);
      const uploadIds = new Map<string, string>();
      const failedFiles = new Set<string>();
      for (const block of blocks) {
        if (block.type !== "image" || uploadIds.has(block.file) || failedFiles.has(block.file)) continue;
        try {
          uploadIds.set(block.file, await uploadImage(client, paced, block.file));
        } catch (error) {
          failedFiles.add(block.file);
          const message = error instanceof Error ? error.message : String(error);
          console.error(`image upload failed ${block.file}: ${message.slice(0, 200)}`);
        }
      }
      const prepared = blocksAfterUpload(blocks, failedFiles);
      const children = prepared.flatMap((block) => {
        const request = toNotionRequest(block, uploadIds);
        return request ? [request] : [];
      });
      const created = await paced(() =>
        client.pages.create({
          parent: { page_id: parentPageId },
          properties: { title: { title: textItem(title) } },
          icon: { type: "emoji", emoji: "📗" },
          cover: { type: "external", external: { url: LECTURE_COVER } },
          children: children.slice(0, 40),
        }),
      );
      const pageId = created.id;
      assertNotForbidden(pageId);
      if (compactId(pageId) === compactId(parentPageId)) {
        throw new Error("Refusing: create returned the parent page.");
      }
      let rest = children.slice(40);
      while (rest.length > 0) {
        const chunk = rest.slice(0, 40);
        rest = rest.slice(40);
        await paced(() => client.blocks.children.append({ block_id: pageId, children: chunk }));
      }
      const url = "url" in created && typeof created.url === "string" ? created.url : `https://www.notion.so/${compactId(pageId)}`;
      return { id: pageId, url };
    },
  };
}

export async function publishDraft(options: {
  draft: LectureDraft;
  parentPageId: string;
  writer: PageWriter;
  title?: string;
  /** Write even though the content gate failed. Bloom stays closed. */
  humanReview?: boolean;
}): Promise<{ page: CreatedPage; bloom: { allowed: boolean; reason: string; ops: number } }> {
  assertPublishParent(options.parentPageId, options.parentPageId);
  const gate = reviewContent(options.draft);
  const bloom = dryRunBloom(options.draft);
  const blocked = !gate.pass || !bloom.allowed;
  if (blocked && !options.humanReview) {
    throw new Error(bloom.reason);
  }
  const page = await options.writer.createPage({
    parentPageId: options.parentPageId,
    title: options.title ?? publishTitle(options.draft),
    blocks: blocked ? humanReviewBlocks(options.draft) : draftToBlocks(options.draft),
  });
  assertNotForbidden(page.id);
  if (compactId(page.id) === compactId(options.parentPageId)) {
    throw new Error("Refusing: create returned the parent page.");
  }
  if (blocked) return { page, bloom: { allowed: false, reason: bloom.reason, ops: 0 } };
  return { page, bloom };
}

/** Beautify one test page. If a formula changes, roll the page back. */
export async function applyBloomIfSafe(
  client: Client,
  pageId: string,
  allowedParentId: string,
  contentPassed: boolean,
  themeId = "warm-notes",
): Promise<{ applied: number; formulaDamage: number; rolledBack: boolean }> {
  if (!contentPassed) throw new Error(QUALITY_FAIL.beautifyBeforeContent);
  assertNotForbidden(pageId);
  const retrieved = await client.pages.retrieve({ page_id: pageId });
  if (!isFullPage(retrieved)) throw new Error("Page is not visible.");
  const parent = retrieved.parent;
  const parentId = "page_id" in parent && typeof parent.page_id === "string" ? compactId(parent.page_id) : "";
  assertPublishParent(parentId, allowedParentId);
  if (compactId(pageId) === compactId(allowedParentId)) {
    throw new Error("Refusing: bloom does not edit the parent page.");
  }
  const { page } = await readPage(client, pageId, 2000);
  await setHandoff(page.id, "content_pass", "pipeline content gate passed");
  const plan = proposePlan(page, { themeId });
  const report = await applyToNotion({ client, page, ops: plan.ops, dryRun: false });
  const after = await readPage(client, pageId, 2000);
  const diff = diffAfterBeautify(page, after.page);
  if (diff.formulaDamage.length > 0 && report.snapshot) {
    await restoreSnapshot(client, report.snapshot, true);
    return { applied: report.applied, formulaDamage: diff.formulaDamage.length, rolledBack: true };
  }
  return { applied: report.applied, formulaDamage: diff.formulaDamage.length, rolledBack: false };
}

export function notionClientFromEnv(): Client | null {
  const token = process.env.NOTION_TOKEN || process.env.NOTION_API_KEY;
  return token ? createNotionClient(token) : null;
}
