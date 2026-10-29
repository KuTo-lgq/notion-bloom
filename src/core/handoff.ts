/**
 * Review gate.
 *
 * Beautify is not allowed to start until someone records that content review
 * passed. The tool does not decide who reviews or who gets notified. It only
 * stores the state and refuses a real write when the state is wrong.
 *
 * States, in order:
 *   (none) → content_pass → beautifying → rereview_pass
 * content_pass may be recorded again after rereview_pass, which starts a new round.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const HANDOFF_STATES = ["content_pass", "beautifying", "rereview_pass"] as const;
export type HandoffState = (typeof HANDOFF_STATES)[number];

export type HandoffRecord = {
  pageId: string;
  state: HandoffState;
  updatedAt: string;
  note?: string;
};

type Store = Record<string, HandoffRecord>;

export function defaultHandoffPath(): string {
  return process.env.NOTION_BLOOM_STATE ?? path.join(process.cwd(), ".notion-bloom", "handoff.json");
}

async function readStore(file: string): Promise<Store> {
  try {
    const raw = await readFile(file, "utf8");
    const parsed = JSON.parse(raw) as Store;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeStore(file: string, store: Store): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(store, null, 2)}\n`);
}

export async function getHandoff(pageId: string, file = defaultHandoffPath()): Promise<HandoffRecord | null> {
  const store = await readStore(file);
  return store[pageId] ?? null;
}

const ALLOWED: Record<HandoffState, Array<HandoffState | null>> = {
  content_pass: [null, "content_pass", "rereview_pass"],
  beautifying: ["content_pass", "beautifying"],
  rereview_pass: ["beautifying"],
};

export function transitionAllowed(from: HandoffState | null, to: HandoffState): boolean {
  return ALLOWED[to].includes(from);
}

export async function setHandoff(
  pageId: string,
  state: HandoffState,
  note?: string,
  file = defaultHandoffPath(),
): Promise<HandoffRecord> {
  const store = await readStore(file);
  const current = store[pageId]?.state ?? null;
  if (!transitionAllowed(current, state)) {
    throw new Error(
      `不能从「${current ?? "未记录"}」改成「${state}」。内容审 Pass 之后才能美化，美化之后才能记复审 Pass。`,
    );
  }
  const record: HandoffRecord = {
    pageId,
    state,
    updatedAt: new Date().toISOString(),
    note,
  };
  store[pageId] = record;
  await writeStore(file, store);
  return record;
}

/** A real write is allowed only after content review, or while a beautify round is already open. */
export function beautifyAllowed(state: HandoffState | null): { allowed: boolean; reason: string } {
  if (state === "content_pass" || state === "beautifying") {
    return { allowed: true, reason: `当前状态是 ${state}，可以写入。` };
  }
  if (state === "rereview_pass") {
    return { allowed: false, reason: "复审已经 Pass。要再改一版，先把状态记回 content_pass。" };
  }
  return { allowed: false, reason: "内容未过关就美化 = Fail。先把内容审记为 content_pass，再写入。" };
}
