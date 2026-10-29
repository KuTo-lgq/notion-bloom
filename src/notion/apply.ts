/**
 * Executes a plan against a live Notion page.
 *
 * Two constraints from the API shape every decision here:
 *
 * - A block's type cannot change in place. `PATCH /v1/blocks/{id}` updates the
 *   content *of the block's current type* and rejects a different type key, so
 *   a conversion is an append of the new block followed by a delete of the old
 *   one. The id changes; the id map carries every later op across.
 * - Children can only be inserted relative to a sibling (`position`), never by
 *   rewriting a parent's `children` array.
 *
 * The snapshot is computed from the page already read and returned to the
 * caller. Nothing is persisted server-side.
 */

import type { Client } from "@notionhq/client";
import { isNotionClientError } from "@notionhq/client";
import type { BlockObjectResponse, UpdateBlockParameters } from "@notionhq/client/build/src/api-endpoints";

import { applyOpsToPage, columnListFor, takeSnapshot, type Snapshot } from "@/core/planner";
import type { Op } from "@/core/ops";
import { findBlock, walk } from "@/core/text";
import type { BlockType, PolishBlock, PolishPage } from "@/core/types";

import { toBlockRequest, toLanguage, toRichText } from "./map";
import { createPacer } from "./pace";

export type OpResult = {
  opId: string;
  status: "applied" | "skipped" | "failed";
  detail?: string;
};

export type ApplyReport = {
  dryRun: boolean;
  snapshot?: Snapshot;
  results: OpResult[];
  applied: number;
  skipped: number;
  failed: number;
  /** Old block id to the id of the block that replaced it. */
  idMap: Record<string, string>;
};

type Location = { parentId: string; block: PolishBlock };

function indexParents(page: PolishPage): Map<string, Location> {
  const map = new Map<string, Location>();
  const visit = (blocks: PolishBlock[], parentId: string) => {
    for (const block of blocks) {
      map.set(block.id, { parentId, block });
      if (block.children?.length) visit(block.children, block.id);
    }
  };
  visit(page.blocks, page.id);
  return map;
}

function resolve(id: string, idMap: Map<string, string>): string {
  return idMap.get(id) ?? id;
}

function position(after: string | null, idMap: Map<string, string>) {
  if (after === null) return { type: "start" as const };
  return { type: "after_block" as const, after_block: { id: resolve(after, idMap) } };
}

/**
 * The type a block has after earlier ops in this plan, so updates hit the right key.
 * Compare the original id. After a convert, the id map points at the new block,
 * and matching that new id would miss the conversion and send the old type.
 */
function liveType(block: PolishBlock, earlier: Op[]): BlockType {
  let type = block.type;
  for (const op of earlier) {
    if (op.kind === "convert_block" && op.blockId === block.id) type = op.to;
  }
  return type;
}

function updateBody(type: BlockType, patch: Record<string, unknown>): Omit<UpdateBlockParameters, "block_id"> {
  return { [type]: patch } as Omit<UpdateBlockParameters, "block_id">;
}

function describeError(error: unknown): string {
  if (isNotionClientError(error)) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

export type ApplyOptions = {
  client: Client;
  page: PolishPage;
  ops: Op[];
  dryRun?: boolean;
};

export async function applyToNotion(options: ApplyOptions): Promise<ApplyReport> {
  const { client, page, ops, dryRun = false } = options;
  const parents = indexParents(page);
  const idMap = new Map<string, string>();
  const results: OpResult[] = [];
  const paced = createPacer();
  const appliedOps: Op[] = [];
  // Local copy so a later op sees text and colour edits made earlier in this plan.
  let shadow = page;

  const call = <T>(fn: () => Promise<T>) => paced(fn);

  for (const op of ops) {
    try {
      const outcome = await applyOne(op);
      results.push(outcome);
      if (outcome.status === "failed") break;
      if (outcome.status === "applied") {
        appliedOps.push(op);
        shadow = applyOpsToPage(shadow, [op]);
      }
    } catch (error) {
      results.push({ opId: op.id, status: "failed", detail: describeError(error) });
      break;
    }
  }

  const applied = results.filter((r) => r.status === "applied").length;
  const skipped = results.filter((r) => r.status === "skipped").length;

  return {
    dryRun,
    snapshot: dryRun ? undefined : takeSnapshot(page, appliedOps),
    results,
    applied,
    skipped,
    failed: results.filter((r) => r.status === "failed").length,
    idMap: Object.fromEntries(idMap),
  };

  async function applyOne(op: Op): Promise<OpResult> {
    switch (op.kind) {
      case "set_page_icon": {
        if (dryRun) return { opId: op.id, status: "applied", detail: "dry run" };
        await call(() =>
          client.pages.update({
            page_id: page.id,
            icon:
              op.icon.type === "emoji"
                ? { type: "emoji", emoji: op.icon.emoji }
                : { type: "external", external: { url: op.icon.url } },
          }),
        );
        return { opId: op.id, status: "applied" };
      }

      case "set_page_cover": {
        if (dryRun) return { opId: op.id, status: "applied", detail: "dry run" };
        await call(() =>
          client.pages.update({
            page_id: page.id,
            cover: { type: "external", external: { url: op.url } },
          }),
        );
        return { opId: op.id, status: "applied" };
      }

      case "set_block_color":
      case "set_callout_icon":
      case "set_code_language":
      case "set_rich_text":
        return updateInPlace(op);

      case "insert_block": {
        const parentId = op.after === null ? page.id : (parents.get(op.after)?.parentId ?? page.id);
        return insert(parentId, op.after, [op.block], op.id);
      }

      case "convert_block":
        return recreate(op.blockId, op.id, (block) => ({
          ...block,
          type: op.to,
          icon: op.icon ?? block.icon,
          color: op.color ?? block.color,
        }));

      case "replace_block":
        return recreateMany(op.blockId, op.blocks, op.id);

      case "wrap_in_columns": {
        const built = columnListFor(shadow, op);
        const located = parents.get(op.blockId);
        if (!built || !located) return { opId: op.id, status: "skipped", detail: "找不到要并排的块" };
        const inserted = await insert(located.parentId, previousSibling(page, op.blockId), [built], op.id);
        if (inserted.status !== "applied" || dryRun) return inserted;
        for (const id of op.blockIds) {
          await call(() => client.blocks.delete({ block_id: resolve(id, idMap) }));
        }
        return inserted;
      }

      case "delete_block": {
        const id = resolve(op.blockId, idMap);
        if (!parents.has(op.blockId) && !idMap.has(op.blockId)) {
          return { opId: op.id, status: "skipped", detail: "块已不存在" };
        }
        if (dryRun) return { opId: op.id, status: "applied", detail: "dry run" };
        await call(() => client.blocks.delete({ block_id: id }));
        return { opId: op.id, status: "applied" };
      }

      default: {
        const exhaustive: never = op;
        return { opId: (exhaustive as Op).id, status: "failed", detail: "未知操作" };
      }
    }
  }

  async function updateInPlace(op: Extract<Op, { blockId: string }>): Promise<OpResult> {
    const located = parents.get(op.blockId);
    if (!located) return { opId: op.id, status: "skipped", detail: "找不到目标块" };
    const type = liveType(located.block, appliedOps);
    const id = resolve(op.blockId, idMap);

    let patch: Record<string, unknown>;
    switch (op.kind) {
      case "set_block_color": {
        patch = { color: op.color };
        // Heading updates are rejected unless rich_text is present, even when
        // the only change is the colour.
        if (type.startsWith("heading_")) {
          const current = findBlock(shadow.blocks, op.blockId) ?? located.block;
          patch.rich_text = toRichText(current.richText);
        }
        break;
      }
      case "set_callout_icon":
        if (type !== "callout") return { opId: op.id, status: "skipped", detail: "目标块不是 callout" };
        patch = {
          icon:
            op.icon.type === "emoji"
              ? { type: "emoji", emoji: op.icon.emoji }
              : { type: "external", external: { url: op.icon.url } },
        };
        break;
      case "set_code_language":
        if (type !== "code") return { opId: op.id, status: "skipped", detail: "目标块不是代码块" };
        patch = { language: toLanguage(op.language) };
        break;
      case "set_rich_text":
        patch = { rich_text: toRichText(op.richText) };
        break;
      default:
        return { opId: op.id, status: "skipped", detail: "不是原地更新" };
    }

    if (dryRun) return { opId: op.id, status: "applied", detail: "dry run" };
    await call(() => client.blocks.update({ block_id: id, ...updateBody(type, patch) }));
    return { opId: op.id, status: "applied" };
  }

  async function insert(
    parentId: string,
    after: string | null,
    blocks: PolishBlock[],
    opId: string,
  ): Promise<OpResult> {
    // `after === null` means "first child of this parent", which is the page
    // itself only for a top-level insert. Nested blocks must not jump to the
    // top of the page.
    const resolvedParent = resolve(parentId, idMap);

    if (dryRun) return { opId, status: "applied", detail: `dry run，将插入 ${blocks.length} 个块` };

    let anchor = after;
    const created: string[] = [];
    for (const block of blocks) {
      const response = await call(() =>
        client.blocks.children.append({
          block_id: resolvedParent,
          children: [toBlockRequest(block)],
          position: position(anchor, idMap),
        }),
      );
      const newId = firstId(response.results);
      if (!newId) return { opId, status: "failed", detail: "插入成功但响应里没有新块 id" };
      created.push(newId);
      idMap.set(block.id, newId);
      anchor = block.id;
    }
    return { opId, status: "applied", detail: created.join(", ") };
  }

  async function recreate(
    blockId: string,
    opId: string,
    transform: (block: PolishBlock) => PolishBlock,
  ): Promise<OpResult> {
    const located = parents.get(blockId);
    if (!located) return { opId, status: "skipped", detail: "找不到目标块" };
    if (located.block.children?.length) {
      return {
        opId,
        status: "skipped",
        detail: "这个块有子块。转换需要删除重建，子块的 id 和评论会一起丢失，已跳过",
      };
    }
    const replacement = transform(located.block);
    const previous = previousSibling(page, blockId);
    const inserted = await insert(
      located.parentId,
      previous,
      [{ ...replacement, id: `${blockId}-rebuilt` }],
      opId,
    );
    if (inserted.status !== "applied" || dryRun) return inserted;

    await call(() => client.blocks.delete({ block_id: resolve(blockId, idMap) }));
    const newId = idMap.get(`${blockId}-rebuilt`);
    if (newId) idMap.set(blockId, newId);
    return inserted;
  }

  async function recreateMany(blockId: string, blocks: PolishBlock[], opId: string): Promise<OpResult> {
    const located = parents.get(blockId);
    if (!located) return { opId, status: "skipped", detail: "找不到目标块" };
    const previous = previousSibling(page, blockId);
    const inserted = await insert(located.parentId, previous, blocks, opId);
    if (inserted.status !== "applied" || dryRun) return inserted;
    await call(() => client.blocks.delete({ block_id: resolve(blockId, idMap) }));
    return inserted;
  }
}

/**
 * Rebuilds a page from a snapshot returned by an earlier apply.
 *
 * This deletes every current top-level block and appends the snapshot's tree,
 * then restores the icon and cover. Block ids will not match the snapshot —
 * Notion assigns new ones — and comments on the deleted blocks are gone. The
 * caller has to pass `confirm: true` so this cannot happen by accident.
 */
export async function restoreSnapshot(
  client: Client,
  snapshot: Snapshot,
  confirm: boolean,
): Promise<{ restoredBlocks: number }> {
  if (!confirm) {
    throw new Error("回滚会删除页面当前的全部顶层块再按快照重建。确认后把 confirm 设为 true。");
  }

  const paced = createPacer();
  let cursor: string | undefined;
  const existing: string[] = [];
  do {
    const response = await paced(() =>
      client.blocks.children.list({ block_id: snapshot.pageId, start_cursor: cursor, page_size: 100 }),
    );
    for (const item of response.results) {
      if ("id" in item && item.id) existing.push(item.id);
    }
    cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
  } while (cursor);

  for (const id of existing) {
    await paced(() => client.blocks.delete({ block_id: id }));
  }

  await appendTree(client, paced, snapshot.pageId, snapshot.blocks);

  await paced(() =>
    client.pages.update({
      page_id: snapshot.pageId,
      icon: snapshot.icon
        ? snapshot.icon.type === "emoji"
          ? { type: "emoji", emoji: snapshot.icon.emoji }
          : { type: "external", external: { url: snapshot.icon.url } }
        : null,
      cover: snapshot.cover ? { type: "external", external: { url: snapshot.cover } } : null,
    }),
  );

  return { restoredBlocks: snapshot.blocks.length };
}

async function appendTree(
  client: Client,
  paced: ReturnType<typeof createPacer>,
  parentId: string,
  blocks: PolishBlock[],
): Promise<void> {
  for (const block of blocks) {
    const response = await paced(() =>
      client.blocks.children.append({
        block_id: parentId,
        children: [toBlockRequest(block)],
        position: { type: "end" },
      }),
    );
    const newId = firstId(response.results);
    if (newId && block.children?.length) {
      await appendTree(client, paced, newId, block.children);
    }
  }
}

function firstId(results: Array<{ id?: string } | BlockObjectResponse>): string | undefined {
  const first = results[0];
  return first && "id" in first ? first.id : undefined;
}

function previousSibling(page: PolishPage, blockId: string): string | null {
  for (const entry of walk(page.blocks)) {
    if (entry.block.id !== blockId) continue;
    return entry.index === 0 ? null : entry.siblings[entry.index - 1].id;
  }
  return null;
}
