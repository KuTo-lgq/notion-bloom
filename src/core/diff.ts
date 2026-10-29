/**
 * Turns a list of ops into the block ids a preview should highlight, so the
 * before/after images read as a diff rather than two similar screenshots.
 */

import type { Op } from "./ops";

export type OpTargets = {
  /** Blocks modified in place. */
  changedIds: string[];
  /** Blocks the plan introduces. */
  addedIds: string[];
  /** Blocks the plan removes — highlighted on the "before" side only. */
  removedIds: string[];
  pageChrome: Array<"icon" | "cover">;
};

export function opTargets(ops: Op[]): OpTargets {
  const changed = new Set<string>();
  const added = new Set<string>();
  const removed = new Set<string>();
  const chrome = new Set<"icon" | "cover">();

  for (const op of ops) {
    switch (op.kind) {
      case "set_page_icon":
        chrome.add("icon");
        break;
      case "set_page_cover":
        chrome.add("cover");
        break;
      case "insert_block":
        added.add(op.block.id);
        break;
      case "replace_block":
        removed.add(op.blockId);
        for (const block of op.blocks) added.add(block.id);
        break;
      case "wrap_in_columns":
        added.add(op.columnListId);
        for (const id of op.blockIds) changed.add(id);
        break;
      case "delete_block":
        removed.add(op.blockId);
        break;
      case "set_block_color":
      case "convert_block":
      case "set_callout_icon":
      case "set_code_language":
      case "set_rich_text":
        changed.add(op.blockId);
        break;
      default: {
        const exhaustive: never = op;
        throw new Error(`unhandled op: ${JSON.stringify(exhaustive)}`);
      }
    }
  }

  return {
    changedIds: [...changed],
    addedIds: [...added],
    removedIds: [...removed],
    pageChrome: [...chrome],
  };
}
