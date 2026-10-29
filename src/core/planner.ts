/**
 * Planning and simulation.
 *
 * `applyOpsToPage` is a pure function: it takes a page and a list of ops and
 * returns the page those ops would produce. That one function is what makes
 * the whole toolkit honest — the preview an agent looks at, the score it is
 * promised, and the state it gets after a real apply all come from the same
 * code path.
 */

import { audit, type AuditResult } from "./audit";
import {
  dedupeOps,
  recreatedBlockIds,
  sortOps,
  type Candidate,
  type Op,
  type Plan,
} from "./ops";
import { runRules, type Finding } from "./rules";
import { getTheme } from "./themes";
import { findBlock, plainText } from "./text";
import type { PolishBlock, PolishPage } from "./types";

export type PlanOptions = {
  themeId?: string;
  /**
   * Include ops that rewrite or remove authored content. Off by default: the
   * cost of a wrong destructive edit on someone's real page is much higher
   * than the cost of leaving a long paragraph long.
   */
  includeDestructive?: boolean;
  /** Only plan fixes for these dimensions. */
  dimensions?: string[];
  /** Skip specific rules, e.g. when a user likes their cover-less pages. */
  excludeRules?: string[];
  /**
   * Allow ops that must delete and re-create a block because the Notion API
   * cannot change a block's type in place. Content is preserved but the block
   * id changes, which drops inline comments and `#block` deep links.
   *
   * On by default: these are the ops that produce most of the visible
   * improvement (a paragraph becoming a callout, an H1 becoming an H2). Set it
   * to `false` on pages where comment threads matter more than typography.
   */
  allowRecreate?: boolean;
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function mapBlocks(
  blocks: PolishBlock[],
  fn: (block: PolishBlock) => PolishBlock | PolishBlock[] | null,
): PolishBlock[] {
  const out: PolishBlock[] = [];
  for (const block of blocks) {
    const withChildren = block.children?.length
      ? { ...block, children: mapBlocks(block.children, fn) }
      : block;
    const result = fn(withChildren);
    if (result === null) continue;
    if (Array.isArray(result)) out.push(...result);
    else out.push(result);
  }
  return out;
}

/** `afterId === null` means "prepend to the top of the page". */
function insertAfter(
  blocks: PolishBlock[],
  afterId: string | null,
  inserted: PolishBlock,
): PolishBlock[] {
  if (afterId === null) return [inserted, ...blocks];
  const out: PolishBlock[] = [];
  for (const block of blocks) {
    out.push(
      block.children?.length
        ? { ...block, children: insertAfter(block.children, afterId, inserted) }
        : block,
    );
    if (block.id === afterId) out.push(inserted);
  }
  return out;
}

/**
 * The single source of truth for what an op does to a page.
 *
 * Ops run in the order given. A plan's order is significant — a later round
 * may edit a block an earlier round converted — so this function does not
 * re-sort them.
 */
export function applyOpsToPage(page: PolishPage, ops: Op[]): PolishPage {
  let next: PolishPage = clone(page);

  for (const op of ops) {
    switch (op.kind) {
      case "set_page_icon":
        next = { ...next, icon: op.icon };
        break;

      case "set_page_cover":
        next = { ...next, cover: op.url };
        break;

      case "set_block_color":
        next = {
          ...next,
          blocks: mapBlocks(next.blocks, (b) =>
            b.id === op.blockId ? { ...b, color: op.color } : b,
          ),
        };
        break;

      case "convert_block":
        next = {
          ...next,
          blocks: mapBlocks(next.blocks, (b) => {
            if (b.id !== op.blockId) return b;
            const converted: PolishBlock = { ...b, type: op.to };
            if (op.to === "callout") {
              converted.icon = op.icon ?? b.icon;
              converted.color = op.color ?? b.color;
            } else if (op.color) {
              converted.color = op.color;
            }
            return converted;
          }),
        };
        break;

      case "set_callout_icon":
        next = {
          ...next,
          blocks: mapBlocks(next.blocks, (b) => (b.id === op.blockId ? { ...b, icon: op.icon } : b)),
        };
        break;

      case "set_code_language":
        next = {
          ...next,
          blocks: mapBlocks(next.blocks, (b) =>
            b.id === op.blockId ? { ...b, language: op.language } : b,
          ),
        };
        break;

      case "set_rich_text":
        next = {
          ...next,
          blocks: mapBlocks(next.blocks, (b) =>
            b.id === op.blockId ? { ...b, richText: op.richText } : b,
          ),
        };
        break;

      case "insert_block":
        next = { ...next, blocks: insertAfter(next.blocks, op.after, clone(op.block)) };
        break;

      case "replace_block":
        next = {
          ...next,
          blocks: mapBlocks(next.blocks, (b) => (b.id === op.blockId ? clone(op.blocks) : b)),
        };
        break;

      case "wrap_in_columns": {
        const built = columnListFor(next, op);
        if (!built) break;
        const rest = new Set(op.blockIds.slice(1));
        next = {
          ...next,
          blocks: mapBlocks(next.blocks, (block) => {
            if (block.id === op.blockId) return built;
            if (rest.has(block.id)) return null;
            return block;
          }),
        };
        break;
      }

      case "delete_block":
        next = {
          ...next,
          blocks: mapBlocks(next.blocks, (b) => (b.id === op.blockId ? null : b)),
        };
        break;

      default: {
        const exhaustive: never = op;
        throw new Error(`unhandled op: ${JSON.stringify(exhaustive)}`);
      }
    }
  }

  return next;
}

/** Reads the blocks as they are now and nests each one in its own column. */
export function columnListFor(
  page: PolishPage,
  op: Extract<Op, { kind: "wrap_in_columns" }>,
): PolishBlock | null {
  const members = op.blockIds
    .map((id) => findBlock(page.blocks, id))
    .filter((block): block is PolishBlock => Boolean(block));
  if (members.length < 2) return null;
  return {
    id: op.columnListId,
    type: "column_list",
    children: members.map((member, index) => ({
      id: `${op.columnListId}-${index}`,
      type: "column" as const,
      children: [clone(member)],
    })),
  };
}

function describeOp(op: Op): string {
  const target = "blockId" in op ? op.blockId : undefined;
  const label = target ? `[${target.slice(0, 8)}]` : "[page]";
  return `${label} ${op.reason}`;
}

/**
 * Fixing one problem reveals the next.
 *
 * Demoting four H1 section headings to H2 is what makes "these sections have
 * no dividers between them" and "this page now has enough headings to deserve
 * a table of contents" true — neither is visible on the original page. So the
 * planner runs the rules, applies what it found to a scratch copy, and looks
 * again, until a round turns up nothing new.
 */
const MAX_PLAN_ROUNDS = 4;

function filterFindings(findings: Finding[], options: PlanOptions): Finding[] {
  let out = findings;
  if (options.excludeRules?.length) {
    const excluded = new Set(options.excludeRules);
    out = out.filter((f) => !excluded.has(f.ruleId));
  }
  if (options.dimensions?.length) {
    const allowed = new Set(options.dimensions);
    out = out.filter((f) => allowed.has(f.dimension));
  }
  return out;
}

export function proposePlan(
  page: PolishPage,
  options: PlanOptions = {},
): Plan & { audit: AuditResult; rounds: number } {
  const theme = getTheme(options.themeId);
  const before = audit(page, theme.id);

  const accepted: Op[] = [];
  const withheld: Op[] = [];
  const candidates: Candidate[] = [];
  const seenOps = new Set<string>();
  const seenCandidates = new Set<string>();
  /** Blocks an earlier round already recoloured, so a later round can't fight it. */
  const settled = new Set<string>();

  let working = page;
  let rounds = 0;

  for (let round = 0; round < MAX_PLAN_ROUNDS; round++) {
    rounds = round + 1;
    const findings = filterFindings(runRules(working, theme.id), options);

    for (const finding of findings) {
      for (const candidate of finding.candidates ?? []) {
        if (seenCandidates.has(candidate.id)) continue;
        seenCandidates.add(candidate.id);
        candidates.push(candidate);
      }
    }

    const fresh = dedupeOps(findings.flatMap((f) => f.ops)).filter((op) => {
      if (seenOps.has(op.id)) return false;
      // Guard against two rounds disagreeing about the same property.
      const key = "blockId" in op ? `${op.kind}:${op.blockId}` : op.kind;
      if (settled.has(key)) return false;
      return true;
    });

    const allowRecreate = options.allowRecreate ?? true;
    const isAllowed = (op: Op) =>
      (options.includeDestructive || !op.destructive) && (allowRecreate || !op.recreates);

    for (const op of fresh) {
      if (isAllowed(op)) continue;
      if (seenOps.has(op.id)) continue;
      seenOps.add(op.id);
      withheld.push(op);
    }

    const chosen = fresh.filter(isAllowed);
    if (chosen.length === 0) break;

    // Kind order only *within* a round. Re-sorting the whole plan would run a
    // later round's colour edit before an earlier round's type conversion and
    // the conversion would overwrite it.
    const ordered = sortOps(chosen);
    for (const op of ordered) {
      seenOps.add(op.id);
      settled.add("blockId" in op ? `${op.kind}:${op.blockId}` : op.kind);
      accepted.push(op);
    }

    working = applyOpsToPage(working, ordered);
  }

  const ops = accepted;
  const recreated = recreatedBlockIds(ops);

  const warnings: string[] = [];
  if (recreated.length > 0) {
    warnings.push(
      `${recreated.length} 个块需要删除后重建（Notion API 无法原地修改块类型）：内容完整保留，但这些块的 id 会变，锚定在它们上面的行内评论和 #block 深链会失效。不接受的话把 allowRecreate 设为 false。`,
    );
  }
  const heldForContent = withheld.filter((op) => op.destructive);
  const heldForId = withheld.filter((op) => op.recreates && !op.destructive);
  if (heldForContent.length > 0) {
    warnings.push(
      `${heldForContent.length} 个操作被扣下，因为它们会改写或删除原文。要执行请显式传 includeDestructive。`,
    );
  }
  if (heldForId.length > 0) {
    warnings.push(
      `${heldForId.length} 个改变块类型的操作被扣下。allowRecreate 为 false 时不删除重建块，评论和深链得以保留。`,
    );
  }

  return {
    themeId: theme.id,
    ops,
    withheld,
    candidates,
    diff: ops.map(describeOp),
    warnings,
    audit: before,
    rounds,
  };
}

export type PlanProjection = {
  before: AuditResult;
  after: AuditResult;
  delta: number;
  resolvedRuleIds: string[];
  remainingRuleIds: string[];
};

/**
 * Replays a plan through the rules to show what it actually buys. An agent can
 * use the delta to decide whether a plan is worth applying at all.
 */
export function projectPlan(page: PolishPage, ops: Op[], themeId?: string): PlanProjection {
  const theme = getTheme(themeId);
  const before = audit(page, theme.id);
  const after = audit(applyOpsToPage(page, ops), theme.id);

  const beforeRules = new Set(before.findings.map((f) => f.ruleId));
  const afterRules = new Set(after.findings.map((f) => f.ruleId));

  return {
    before,
    after,
    delta: after.overall - before.overall,
    resolvedRuleIds: [...beforeRules].filter((id) => !afterRules.has(id)),
    remainingRuleIds: [...afterRules],
  };
}

/**
 * Snapshot of the state an apply is about to overwrite. Returned to the caller
 * rather than stored server-side: a stateless tool cannot lose the user's undo
 * history, and cloud filesystems are ephemeral anyway.
 */
export type Snapshot = {
  version: 1;
  takenAt: string;
  pageId: string;
  title: string;
  icon?: PolishPage["icon"];
  cover?: string;
  /** Full block tree before the change. */
  blocks: PolishBlock[];
  propertyFormulas?: PolishPage["propertyFormulas"];
  /** Ops this snapshot was taken against, for traceability. */
  opIds: string[];
  /** Plain text digest so a human can eyeball what was captured. */
  digest: string;
};

export function pageFromSnapshot(snapshot: Snapshot): PolishPage {
  return {
    id: snapshot.pageId,
    title: snapshot.title,
    icon: snapshot.icon,
    cover: snapshot.cover,
    blocks: snapshot.blocks,
    propertyFormulas: snapshot.propertyFormulas,
  };
}

export function takeSnapshot(page: PolishPage, ops: Op[]): Snapshot {
  return {
    version: 1,
    takenAt: new Date().toISOString(),
    pageId: page.id,
    title: page.title,
    icon: page.icon,
    cover: page.cover,
    blocks: clone(page.blocks),
    propertyFormulas: page.propertyFormulas ? clone(page.propertyFormulas) : undefined,
    opIds: ops.map((o) => o.id),
    digest: page.blocks
      .slice(0, 8)
      .map((b) => `${b.type}:${plainText(b.richText).slice(0, 20)}`)
      .join(" | "),
  };
}
