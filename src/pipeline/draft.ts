/**
 * Second stage. Turns an ingest into a lecture draft a beginner can follow.
 *
 * Numbered lines stay in order, with no gaps. A complex formula keeps the
 * 推导 lines that sit above it. 考点 / 定义 / 注意 become callouts. A picture
 * cut at ingest is attached; 如图 with no file is 【图缺】, not a pretend image.
 *
 * 跳步 = Fail
 * 无推导的复杂公式 = Fail
 * 内容未过关就美化 = Fail
 */

import { COMPLEX_FORMULA, HANDWAVE } from "./quality";
import type { DeckIngest, IngestSlide, LectureCallout, LectureDraft, LectureFormula, LectureSection, LectureStep } from "./types";

const SKIP = /references|thank you|参考文献|谢谢|目录|导览|agenda|contents|pause & think/i;

function linesOf(text: string): string[] {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function withoutMath(line: string): string {
  return line
    .replace(/\$[^$]+\$/g, "")
    .replace(HANDWAVE, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stepsFrom(lines: string[]): LectureStep[] {
  const numbered = lines.flatMap((line) => {
    const match = line.match(/^(\d+)\s*[.、．]\s*(.+)$/);
    if (!match) return [];
    const text = withoutMath(match[2]);
    return text ? [text] : [];
  });
  return numbered.map((text, index) => ({ n: index + 1, text }));
}

function proseFrom(title: string, lines: string[]): string {
  const body = lines.filter((line) => {
    if (/^推导[:：]/.test(line)) return false;
    if (/^(\d+)\s*[.、．]/.test(line)) return false;
    if (/例如[:：]|for example|e\.g\.|an example/i.test(line)) return false;
    if (/^(考点|易错|定义|注意|warning\b)/i.test(line) || /key point/i.test(line)) return false;
    if (line.includes("$")) return false;
    if (/^【图缺】/.test(line)) return false;
    if (/[\u{1D400}-\u{1D7FF}]/u.test(line) || /[∈ℝ∑∫∇∘≤≥]/.test(line)) return false;
    return withoutMath(line).length > 0;
  });
  const told = body.join(" ");
  if (!told) return `这一节讲${title}。`;
  return told.startsWith(title) ? told : `${title}。${told}`;
}

function formulasFrom(lines: string[]): LectureFormula[] {
  const pending: string[] = [];
  const formulas: LectureFormula[] = [];
  for (const line of lines) {
    if (/^推导[:：]/.test(line)) {
      const text = withoutMath(line.replace(/^推导[:：]\s*/, ""));
      if (text) pending.push(text);
      continue;
    }
    const match = line.match(/\$([^$]+)\$/);
    if (!match) continue;
    const expression = match[1].trim();
    formulas.push({
      id: `f-${formulas.length + 1}`,
      expression,
      display: COMPLEX_FORMULA.test(expression) ? "block" : "inline",
      derivation: pending.splice(0, pending.length),
    });
  }
  return formulas;
}

function calloutsFrom(lines: string[]): LectureCallout[] {
  const callouts: LectureCallout[] = [];
  for (const line of lines) {
    const text = withoutMath(line);
    if (!text) continue;
    if (/^(考点|易错)/.test(line) || /key point/i.test(line)) {
      callouts.push({ icon: "🎯", tone: "exam", text });
    } else if (/^定义/.test(line) || /^definition\b/i.test(line)) {
      callouts.push({ icon: "📘", tone: "definition", text });
    } else if (/^(注意|warning\b)/i.test(line)) {
      callouts.push({ icon: "⚠️", tone: "warning", text });
    }
  }
  return callouts;
}

function exampleFrom(lines: string[]): string {
  const line = lines.find((item) => /例如[:：]|for example|e\.g\.|an example/i.test(item));
  if (!line) return "";
  const text = withoutMath(line.replace(/^(例如[:：]|for example[:,]?|e\.g\.|an example[:,]?)\s*/i, ""));
  return text.length >= 8 ? text : "";
}

function unparsedMathFrom(lines: string[]): string[] {
  const mathLetter = /[\u{1D400}-\u{1D7FF}]/u;
  const symbol = /[∈ℝ∑∫∇∘≤≥]/;
  return lines
    .filter((line) => !line.includes("$") && (mathLetter.test(line) || symbol.test(line)) && line.length > 8)
    .map((line) => line.slice(0, 160));
}

function sectionFrom(slide: IngestSlide): LectureSection {
  const lines = linesOf(slide.text);
  const example = exampleFrom(lines);
  const callouts = calloutsFrom(lines);
  const blob = `${slide.title}\n${slide.text}`;
  const asksForFigure = /如图|见下图|见右图|【图缺】/.test(blob) || Boolean(slide.embedded);
  return {
    id: `slide-${slide.number}`,
    chapter: slide.chapter || "本讲",
    titleZh: slide.title,
    titleEn: slide.title,
    prose: proseFrom(slide.title, lines),
    steps: stepsFrom(lines),
    formulas: formulasFrom(lines),
    example,
    callouts,
    unparsedMath: unparsedMathFrom(lines),
    figure: {
      needed: asksForFigure,
      file: slide.imageFile,
      real: Boolean(slide.imageFile),
      missingMark: asksForFigure && !slide.imageFile,
    },
    marked: callouts.length > 0,
  };
}

const MAX_ILLUSTRATIONS = 12;
/** Coarse chapters share up to three pictures. One picture per chapter forced every slide into its own H1. */
const MAX_PER_CHAPTER = 3;
const VISUAL = /图|曲线|结构|激活|xor|svm|overfit|example|示意|activation|structure|regression|perceptron/i;

/** At most one picture per chapter, and only a handful on the page. Text stays the lecture. */
export function assignIllustrations(sections: LectureSection[]): void {
  const forced = sections.filter((section) => section.figure.needed);
  const optional = sections.filter(
    (section) => !section.figure.needed && section.figure.real && section.figure.file && VISUAL.test(`${section.titleZh}\n${section.prose}`),
  );
  const picked: LectureSection[] = [];
  const perChapter = new Map<string, number>();
  for (const section of [...forced, ...optional]) {
    if (picked.length >= MAX_ILLUSTRATIONS) break;
    if ((perChapter.get(section.chapter) ?? 0) >= MAX_PER_CHAPTER) continue;
    picked.push(section);
    perChapter.set(section.chapter, 1);
  }
  const keep = new Set(picked.map((section) => section.id));
  for (const section of sections) {
    if (!keep.has(section.id)) {
      section.figure = { needed: false, real: false, missingMark: false };
      continue;
    }
    section.figure.needed = true;
    if (!section.figure.real) {
      section.figure.file = undefined;
      section.figure.missingMark = true;
    }
  }
}

function keepSlide(slide: IngestSlide): boolean {
  return slide.number !== 1 && !SKIP.test(`${slide.chapter}\n${slide.title}\n${slide.text}`);
}

/** One chapter at a time. Callers merge the pieces before the content gate. */
export function draftSegment(slides: IngestSlide[]): LectureDraft {
  const sections = slides.filter(keepSlide).map(sectionFrom);
  const chapter = slides[0]?.chapter || "本讲";
  return {
    title: chapter,
    roadmap: chapter,
    sections,
    alignmentNotes: [],
  };
}

export function mergeLectureDrafts(parts: LectureDraft[]): LectureDraft {
  const sections = parts.flatMap((part) => part.sections);
  const chapters: string[] = [];
  for (const section of sections) {
    if (!chapters.includes(section.chapter)) chapters.push(section.chapter);
  }
  return {
    title: parts[0]?.title || "课程讲解",
    roadmap: chapters.join(" → "),
    sections,
    alignmentNotes: parts.flatMap((part) => part.alignmentNotes),
  };
}

/** A draft the gate can accept or reject. Slide text is not yet a finished explanation. */
export function draftFromIngest(ingest: DeckIngest): LectureDraft {
  const groups: IngestSlide[][] = [];
  for (const slide of ingest.slides.filter(keepSlide)) {
    const chapter = slide.chapter || "本讲";
    const last = groups[groups.length - 1];
    if (!last || last[0]?.chapter !== chapter) groups.push([slide]);
    else last.push(slide);
  }
  const merged = mergeLectureDrafts(groups.map((group) => draftSegment(group)));
  assignIllustrations(merged.sections);
  const title = ingest.slides[0]?.title || merged.title;
  const hasPractice = ingest.slides.some((slide) => /自测|练习题|self-test|practice questions/i.test(`${slide.title}\n${slide.text}`));
  return {
    ...merged,
    title: `课件生成｜${title}`.slice(0, 180),
    alignmentNotes: hasPractice ? [] : ["未对齐-课件无自测"],
  };
}
