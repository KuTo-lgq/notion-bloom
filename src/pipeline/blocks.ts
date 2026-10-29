/**
 * The Notion shape of a draft.
 * A passing draft gets a tip, a table of contents, callouts, equations, and a picture or 【图缺】.
 * A human-review draft says the content gate failed and does not invent LaTeX.
 */

import { checkKatex } from "@/core/formulas";

import { listGaps } from "./gaps";
import type { LectureDraft, LectureFormula } from "./types";

export type PublishBlock =
  | { type: "callout"; emoji: string; color: "yellow_background" | "orange_background" | "blue_background" | "gray_background"; text: string }
  | { type: "toc" }
  | { type: "heading_1"; text: string }
  | { type: "heading_2"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "numbered_list_item"; text: string }
  | { type: "equation"; expression: string }
  | { type: "image"; file: string; caption: string }
  | { type: "table"; headers: string[]; rows: string[][] };

const CALLOUT_COLOR = {
  exam: "orange_background",
  definition: "blue_background",
  warning: "yellow_background",
  example: "gray_background",
} as const;

function formulaBlocks(formula: LectureFormula): PublishBlock[] {
  const blocks: PublishBlock[] = [];
  for (const line of formula.derivation) {
    if (line.trim()) blocks.push({ type: "paragraph", text: line });
  }
  if (!formula.expression.trim()) return blocks;
  if (checkKatex(formula.expression)) {
    blocks.push({
      type: "paragraph",
      text: `【公式缺/待补】这处公式没有通过检查，不排成公式，也不另写一个式子。课件原文：${formula.expression.slice(0, 160)}`,
    });
    return blocks;
  }
  blocks.push({ type: "equation", expression: formula.expression });
  return blocks;
}

export function draftToBlocks(draft: LectureDraft): PublishBlock[] {
  const blocks: PublishBlock[] = [
    {
      type: "callout",
      emoji: "📍",
      color: "yellow_background",
      text: draft.roadmap ? `本讲主线：${draft.roadmap}` : "本讲主线见下面各节。",
    },
    { type: "toc" },
  ];
  let chapter = "";
  for (const section of draft.sections) {
    if (section.chapter && section.chapter !== chapter) {
      chapter = section.chapter;
      blocks.push({ type: "heading_1", text: chapter });
    }
    if (section.showHeading !== false) blocks.push({ type: "heading_2", text: section.titleZh });
    if (section.prose.trim()) blocks.push({ type: "paragraph", text: section.prose });
    for (const callout of section.callouts) {
      blocks.push({
        type: "callout",
        emoji: callout.icon,
        color: CALLOUT_COLOR[callout.tone],
        text: callout.text,
      });
    }
    for (const step of section.steps) {
      const text = step.text.replace(/^\s*\d+\s*[.、．]\s*/, "");
      blocks.push({ type: "numbered_list_item", text });
    }
    if (section.example.trim()) blocks.push({ type: "paragraph", text: `例如：${section.example}` });
    if (section.table && section.table.headers.length >= 2 && section.table.rows.length > 0) {
      blocks.push({ type: "table", headers: section.table.headers, rows: section.table.rows });
    }
    for (const formula of section.formulas) blocks.push(...formulaBlocks(formula));
    for (const raw of section.unparsedMath) {
      blocks.push({
        type: "paragraph",
        text: `【公式缺/待补】不转写成 LaTeX。课件抽出的原文：${raw}`,
      });
    }
    if (section.figure.file) {
      blocks.push({
        type: "image",
        file: section.figure.file,
        caption: `${section.titleZh} 的课件图`,
      });
    } else if (section.figure.missingMark) {
      blocks.push({ type: "paragraph", text: "【图缺】这一节写了见图，课件里没有可嵌入的图。" });
    }
  }
  return blocks;
}

/** Pending human review. The gate failed, so the page says so and is not a finished lecture. */
export function humanReviewBlocks(draft: LectureDraft): PublishBlock[] {
  const gaps = listGaps(draft);
  const formulaGaps = gaps.filter((gap) => gap.kind === "derivation").length;
  const otherGaps = gaps.length - formulaGaps;
  const notes = draft.alignmentNotes.filter(Boolean).join("；");
  const banner: PublishBlock[] = [
    {
      type: "callout",
      emoji: "⚠️",
      color: "orange_background",
      text: `【内容审 Fail】【未美化】这是待审稿，没有跑美化。公式缺口 ${formulaGaps} 处，其他缺口 ${otherGaps} 处，合计 ${gaps.length}。不可靠公式只标【公式缺/待补】，没有编造 LaTeX。${notes}`,
    },
    { type: "heading_2", text: "缺口明细（不补公式）" },
  ];
  for (const gap of gaps) {
    banner.push({
      type: "paragraph",
      text: `第 ${gap.slide ?? "?"} 页｜${gap.kind}｜${gap.message}`,
    });
  }
  return [...banner, ...draftToBlocks(draft)];
}
