/**
 * The operation vocabulary.
 *
 * Every change the toolkit can make to a Notion page is expressed as one of
 * these ops. Keeping them small and declarative is what makes a plan
 * reviewable by a human, replayable by an agent, and diffable in a preview.
 */

import type {
  BlockIcon,
  CalloutIntent,
  NotionColor,
  PolishBlock,
  RichText,
  ScoreDimension,
} from "./types";

export type OpKind =
  | "set_page_icon"
  | "set_page_cover"
  | "set_block_color"
  | "convert_block"
  | "set_callout_icon"
  | "set_code_language"
  | "set_rich_text"
  | "insert_block"
  | "replace_block"
  | "wrap_in_columns"
  | "delete_block";

type OpBase = {
  /** Stable id derived from the op's content, so plans dedupe cleanly. */
  id: string;
  kind: OpKind;
  /** Which score dimension this op is trying to move. */
  dimension: ScoreDimension;
  /** Human readable justification, surfaced in the plan diff. */
  reason: string;
  /**
   * `true` when the op removes or rewrites content a human wrote. Destructive
   * ops are excluded from a plan unless explicitly opted into.
   */
  destructive: boolean;
  /**
   * `true` when applying this op has to delete the original block and create a
   * replacement, because the Notion API cannot change a block's type in place
   * — `PATCH /v1/blocks/{id}` updates content *for the block's existing type*
   * and 400s on a mismatched type key.
   *
   * The content survives verbatim; the block id does not. Anything anchored to
   * the old id (inline comments, `#block` deep links) is lost. That is a
   * different cost from `destructive`, so it gets its own flag and its own
   * opt-out rather than being quietly folded into either category.
   */
  recreates?: boolean;
};

export type SetPageIconOp = OpBase & {
  kind: "set_page_icon";
  icon: BlockIcon;
};

export type SetPageCoverOp = OpBase & {
  kind: "set_page_cover";
  url: string;
};

export type SetBlockColorOp = OpBase & {
  kind: "set_block_color";
  blockId: string;
  color: NotionColor;
  previousColor?: NotionColor;
};

/** Changes a block's type in place, keeping its inline content. */
export type ConvertBlockOp = OpBase & {
  kind: "convert_block";
  blockId: string;
  to:
    | "callout"
    | "quote"
    | "heading_2"
    | "heading_3"
    | "heading_4"
    | "bulleted_list_item"
    | "paragraph"
    | "toggle";
  /** Only meaningful when `to` is `callout`. */
  intent?: CalloutIntent;
  icon?: BlockIcon;
  color?: NotionColor;
};

export type SetCalloutIconOp = OpBase & {
  kind: "set_callout_icon";
  blockId: string;
  icon: BlockIcon;
};

export type SetCodeLanguageOp = OpBase & {
  kind: "set_code_language";
  blockId: string;
  language: string;
};

export type SetRichTextOp = OpBase & {
  kind: "set_rich_text";
  blockId: string;
  richText: RichText[];
};

/**
 * Inserts a new block. `after` is the id of the sibling to insert behind;
 * `null` means "at the very top of the page".
 */
export type InsertBlockOp = OpBase & {
  kind: "insert_block";
  after: string | null;
  block: PolishBlock;
};

/**
 * Replaces one block with several — the only way to express "this run-on
 * paragraph is really a list". Always destructive: the original block is gone
 * and its id cannot be recovered.
 */
export type ReplaceBlockOp = OpBase & {
  kind: "replace_block";
  blockId: string;
  blocks: PolishBlock[];
};

/**
 * Lays consecutive sibling blocks out side by side. The op names the blocks
 * and nothing else: their content is read at apply time, so an earlier op in
 * the same plan can still recolor or re-emphasize them first.
 */
export type WrapInColumnsOp = OpBase & {
  kind: "wrap_in_columns";
  /** First block, used so two column groups on one page don't collapse into one settled key. */
  blockId: string;
  blockIds: string[];
  columnListId: string;
};

export type DeleteBlockOp = OpBase & {
  kind: "delete_block";
  blockId: string;
};

export type Op =
  | SetPageIconOp
  | SetPageCoverOp
  | SetBlockColorOp
  | ConvertBlockOp
  | SetCalloutIconOp
  | SetCodeLanguageOp
  | SetRichTextOp
  | InsertBlockOp
  | ReplaceBlockOp
  | WrapInColumnsOp
  | DeleteBlockOp;

/**
 * A suggestion that needs semantic judgement the toolkit deliberately refuses
 * to make on its own. The calling agent reads the content, picks a variant (or
 * none), and feeds the chosen op back into the plan.
 */
export type Candidate = {
  id: string;
  blockId: string;
  /** Excerpt of the block being discussed, so an agent can judge without refetching. */
  excerpt: string;
  question: string;
  variants: Array<{
    label: string;
    rationale: string;
    /** `null` is the "leave it alone" variant, which is often the right call. */
    op: Op | null;
  }>;
};

export type Plan = {
  themeId: string;
  /** Ops that are safe to apply as-is. */
  ops: Op[];
  /** Ops held back because they rewrite or remove authored content. */
  withheld: Op[];
  /** Decisions left to the calling agent. */
  candidates: Candidate[];
  /** One line per op, ordered for human review. */
  diff: string[];
  /** Caveats a caller must see before applying, e.g. block ids that will change. */
  warnings: string[];
};

export function recreatedBlockIds(ops: Op[]): string[] {
  const ids: string[] = [];
  for (const op of ops) {
    if (!op.recreates) continue;
    if (op.kind === "wrap_in_columns") {
      ids.push(...op.blockIds);
      continue;
    }
    if ("blockId" in op) ids.push(op.blockId);
  }
  return ids;
}

/**
 * Stable id for an op so that running the planner twice produces the same plan
 * and `ops` can be merged without duplicates.
 */
export function opId(parts: Array<string | undefined>): string {
  return parts.filter(Boolean).join(":");
}

export function dedupeOps(ops: Op[]): Op[] {
  const seen = new Set<string>();
  const out: Op[] = [];
  for (const op of ops) {
    if (seen.has(op.id)) continue;
    seen.add(op.id);
    out.push(op);
  }
  return out;
}

/**
 * Apply order matters. Page level properties first, then in-place edits (which
 * reference ids that still exist), then insertions, then deletions last so
 * earlier ops can still address the blocks they were planned against.
 */
const KIND_ORDER: Record<OpKind, number> = {
  set_page_icon: 0,
  set_page_cover: 1,
  set_block_color: 2,
  convert_block: 3,
  set_callout_icon: 4,
  set_code_language: 5,
  set_rich_text: 6,
  insert_block: 7,
  wrap_in_columns: 8,
  replace_block: 9,
  delete_block: 10,
};

export function sortOps(ops: Op[]): Op[] {
  return [...ops].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
}
