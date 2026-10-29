/**
 * One entry for the lecture pipeline.
 *
 * ingest → generate → content gate → optional publish → bloom only after a pass.
 * Screenshots stay illustrations. A failing gate is not beautified.
 *
 * 跳步 = Fail
 * 无推导的复杂公式 = Fail
 * 内容未过关就美化 = Fail
 */

import type { Client } from "@notionhq/client";

import { assignIllustrations, draftFromIngest } from "./draft";
import { listGaps, type LectureGap } from "./gaps";
import { refuseBeautify, reviewContent } from "./gate";
import { ingestDeck } from "./ingest";
import { applyBloomIfSafe, notionClientFromEnv, notionWriter, publishDraft, type PageWriter } from "./publish";
import type { ContentGate, DeckIngest, LectureDraft, LectureSection } from "./types";

export type LectureRun = {
  /** skeleton: only a template. draft: the Agent supplied the lecture body. */
  role: "skeleton" | "draft";
  slides: number;
  sections: number;
  illustrations: number;
  gate: ContentGate;
  gaps: LectureGap[];
  alignmentNotes: string[];
  beautify: { allowed: boolean; reason: string };
  published: boolean;
  reason?: string;
  url?: string;
  id?: string;
  /** Present only when no Agent draft was supplied. Not a finished lecture. */
  skeleton?: LectureDraft;
  bloom?: { applied: number; formulaDamage: number; rolledBack: boolean; refused?: boolean; reason?: string };
};

const SKELETON_REASON =
  "讲解正文由调用方 Agent 撰写。这里只返回结构骨架和课件摘录，不会把它当成讲解写入，也不会调用模型。把写好的 draft 交回 run_lecture_pipeline 后再做内容审。";

/** A skeleton is never a passing lecture, even when the extracted notes happen to look complete. */
export function skeletonGate(draft: LectureDraft): ContentGate {
  const content = reviewContent(draft);
  return {
    pass: false,
    failures: [
      {
        rule: "beautify_before_content",
        where: "skeleton",
        message: "这是结构骨架，不是 Agent 写的讲解，不能当作内容审通过。",
      },
      ...content.failures,
    ],
  };
}

function readTable(value: unknown): LectureDraft["sections"][number]["table"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const table = value as Record<string, unknown>;
  const headers = Array.isArray(table.headers) ? table.headers.filter((cell): cell is string => typeof cell === "string") : [];
  const rows = Array.isArray(table.rows)
    ? table.rows
        .filter((row): row is unknown[] => Array.isArray(row))
        .map((row) => row.map((cell) => (typeof cell === "string" ? cell : String(cell ?? ""))))
    : [];
  if (headers.length < 2 || rows.length < 1) return undefined;
  return { headers, rows };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("draft 必须是 Agent 提供的讲解 JSON 对象。");
  }
  return value as Record<string, unknown>;
}

/** Bind the Agent's lecture to real slide renders. Pictures stay capped later. */
export function lectureFromAgent(raw: unknown, ingest: DeckIngest): LectureDraft {
  const value = asRecord(raw);
  const sectionsIn = value.sections;
  if (!Array.isArray(sectionsIn) || sectionsIn.length === 0) {
    throw new Error("draft.sections 不能为空。讲解正文由 Agent 填写。");
  }
  const byNumber = new Map(ingest.slides.map((slide) => [slide.number, slide]));
  const sections: LectureSection[] = sectionsIn.map((item, index) => {
    const section = asRecord(item);
    const id = typeof section.id === "string" ? section.id : `slide-${index + 2}`;
    const slideNo = Number(id.replace("slide-", "")) || index + 2;
    const slide = byNumber.get(slideNo);
    const figure = section.figure && typeof section.figure === "object" ? asRecord(section.figure) : {};
    const needed = figure.needed === true;
    const file = needed && slide?.imageFile ? slide.imageFile : undefined;
    const callouts = Array.isArray(section.callouts) ? (section.callouts as LectureSection["callouts"]) : [];
    return {
      id,
      chapter: typeof section.chapter === "string" ? section.chapter : slide?.chapter || "本讲",
      titleZh: typeof section.titleZh === "string" ? section.titleZh : slide?.title || `第 ${slideNo} 页`,
      titleEn: typeof section.titleEn === "string" ? section.titleEn : "",
      prose: typeof section.prose === "string" ? section.prose : "",
      steps: Array.isArray(section.steps) ? (section.steps as LectureSection["steps"]) : [],
      formulas: Array.isArray(section.formulas) ? (section.formulas as LectureSection["formulas"]) : [],
      example: typeof section.example === "string" ? section.example : "",
      callouts,
      unparsedMath: Array.isArray(section.unparsedMath) ? (section.unparsedMath as string[]) : [],
      table: readTable(section.table),
      showHeading: section.showHeading !== false,
      figure: { needed, file, real: Boolean(file), missingMark: needed && !file },
      marked: section.marked === true || callouts.length > 0,
    };
  });
  assignIllustrations(sections);
  const hasPractice = ingest.slides.some((slide) => /自测|练习题|self-test|practice questions/i.test(`${slide.title}\n${slide.text}`));
  const notes = Array.isArray(value.alignmentNotes) ? (value.alignmentNotes as string[]) : hasPractice ? [] : ["未对齐-课件无自测"];
  return {
    title: typeof value.title === "string" && value.title.trim() ? value.title : "课程讲解",
    roadmap: typeof value.roadmap === "string" ? value.roadmap : "",
    sections,
    alignmentNotes: notes,
    locale: value.locale === "bilingual" ? "bilingual" : "user",
  };
}

export async function runLecturePipeline(options: {
  deckPath: string;
  parentPageId?: string;
  /** Write a pending page even when the content gate fails. Bloom stays closed. */
  review?: boolean;
  /** Beautify only after the content gate passes. */
  apply?: boolean;
  title?: string;
  themeId?: string;
  writer?: PageWriter;
  client?: Client | null;
  /** Lecture body written by the calling Agent. Absent means skeleton only. */
  draft?: unknown;
}): Promise<LectureRun> {
  const ingest = await ingestDeck(options.deckPath);
  const deck = {
    pageCount: ingest.slides.length,
    text: ingest.slides.map((slide) => `${slide.title}\n${slide.text}`).join("\n"),
  };
  if (options.draft === undefined) {
    const skeleton = { ...draftFromIngest(ingest), deck };
    const gate = skeletonGate(skeleton);
    return {
      role: "skeleton",
      slides: ingest.slides.length,
      sections: skeleton.sections.length,
      illustrations: skeleton.sections.filter((section) => section.figure.needed && section.figure.file).length,
      gate,
      gaps: listGaps(skeleton),
      alignmentNotes: skeleton.alignmentNotes,
      beautify: { allowed: false, reason: SKELETON_REASON },
      published: false,
      reason: SKELETON_REASON,
      skeleton,
    };
  }
  const draft = { ...lectureFromAgent(options.draft, ingest), deck };
  const gate = reviewContent(draft);
  const beautify = refuseBeautify(gate);
  const gaps = listGaps(draft);
  const illustrations = draft.sections.filter((section) => section.figure.needed && section.figure.file).length;
  const report: LectureRun = {
    role: "draft",
    slides: ingest.slides.length,
    sections: draft.sections.length,
    illustrations,
    gate,
    gaps,
    alignmentNotes: draft.alignmentNotes,
    beautify,
    published: false,
  };
  const parentPageId = options.parentPageId?.trim() ?? "";
  if (!gate.pass && !options.review) {
    report.reason = beautify.reason;
    return report;
  }
  if (!parentPageId) {
    report.reason = "Pass parentPageId to write a child page. Nothing was written.";
    return report;
  }
  const client = options.client === undefined ? notionClientFromEnv() : options.client;
  const writer = options.writer ?? (client ? notionWriter(client) : undefined);
  if (!writer) {
    report.reason = "NOTION_TOKEN is missing, so the draft was not written.";
    return report;
  }
  const written = await publishDraft({
    draft,
    parentPageId,
    title: options.title,
    humanReview: !gate.pass,
    writer,
  });
  report.published = true;
  report.url = written.page.url;
  report.id = written.page.id;
  if (options.apply && !gate.pass) {
    report.bloom = { applied: 0, formulaDamage: 0, rolledBack: false, refused: true, reason: beautify.reason };
    return report;
  }
  if (options.apply && gate.pass) {
    if (!client) {
      report.bloom = { applied: 0, formulaDamage: 0, rolledBack: false, refused: true, reason: "NOTION_TOKEN is missing, so bloom did not run." };
      return report;
    }
    const bloom = await applyBloomIfSafe(client, written.page.id, parentPageId, true, options.themeId ?? "warm-notes");
    report.bloom = bloom;
  }
  return report;
}
