/**
 * Puts PPT figures next to the section they explain, and reports a section
 * that should have had a figure but has neither an image nor a 【图缺】 mark.
 *
 * Matching is lexical: a slide belongs to the heading whose words it repeats.
 * It does not guess at a slide that never mentions the section.
 */

import type { PolishBlock, PolishPage } from "@/core/types";

import type { PptSlide } from "./extract";

export type FigurePlacement = {
  slide: number;
  heading: string;
  headingId: string;
  imageCount: number;
};

export type MissingFigure = {
  slide?: number;
  heading: string;
  blockId?: string;
  message: string;
};

const NEEDS_FIGURE = /如图|见下图|如下图|图示|见右图|见左图/;
const MISSING_MARK = "【图缺】";

/** At most this many figures land on one page. A lecture deck is not a gallery. */
const MAX_IMPORTANT_FIGURES = 6;

const SKIP_SLIDE = /目录|导览|议程|大纲|封面|谢谢|感谢|参考文献|本讲与前后|agenda|contents|thank you|references/i;
const IMPORTANT_SLIDE = /公式|定理|定义|算法|曲线|示意|损失|梯度|考点|如图|图示|错误|检测|下降|引理|方差|无偏|figure|theorem|diagram|algorithm|loss|gradient/i;

/**
 * What the calling model should do about a deck. Repeated in tool descriptions
 * so a model that only audits still sees it.
 */
export const PPT_AGENT_NOTE =
  "讲解正文由调用方 Agent 撰写，本工具不调用模型。MCP 负责抽课件、给结构骨架、内容审、写入 Notion 和美化。跳步 = Fail。无推导的复杂公式 = Fail。内容未过关就美化 = Fail。";

export function isImportantFigure(heading: string, slideText: string, sectionText = ""): boolean {
  const blob = `${heading}\n${slideText}\n${sectionText}`;
  if (SKIP_SLIDE.test(heading) || SKIP_SLIDE.test(slideText)) return false;
  return IMPORTANT_SLIDE.test(blob) || NEEDS_FIGURE.test(sectionText);
}

type Section = {
  heading: PolishBlock;
  text: string;
};

function sectionsOf(page: PolishPage): Section[] {
  const sections: Section[] = [];
  let current: Section | null = null;
  for (const block of page.blocks) {
    if (block.type === "heading_1" || block.type === "heading_2" || block.type === "heading_3" || block.type === "heading_4") {
      current = {
        heading: block,
        text: (block.richText ?? []).map((run) => run.text).join(""),
      };
      sections.push(current);
      continue;
    }
    if (!current) continue;
    const text = (block.richText ?? []).map((run) => run.text).join("");
    if (block.expression) current.text += block.expression;
    if (text) current.text += text;
  }
  return sections;
}

function bigrams(text: string): Set<string> {
  const compact = text.replace(/\s+/g, "");
  const out = new Set<string>();
  for (let i = 0; i < compact.length - 1; i += 1) out.add(compact.slice(i, i + 2));
  return out;
}

/** Higher is a closer lexical match. 0 means the slide is not about this section. */
export function matchScore(sectionText: string, slideText: string): number {
  const heading = sectionText.trim();
  const slide = slideText.trim();
  if (heading.length < 2 || slide.length < 2) return 0;
  if (slide.includes(heading)) return 100 + heading.length;
  const left = bigrams(heading);
  if (left.size === 0) return 0;
  const right = bigrams(slide);
  let shared = 0;
  for (const gram of left) if (right.has(gram)) shared += 1;
  const ratio = shared / left.size;
  return ratio >= 0.6 ? ratio * 50 : 0;
}

function sectionHasImage(page: PolishPage, headingId: string): boolean {
  let seen = false;
  for (const block of page.blocks) {
    if (block.id === headingId) {
      seen = true;
      continue;
    }
    if (!seen) continue;
    if (block.type.startsWith("heading_")) break;
    if (block.type === "image") return true;
  }
  return false;
}

export function auditFigures(page: PolishPage, slides: PptSlide[]): MissingFigure[] {
  const sections = sectionsOf(page);
  const findings: MissingFigure[] = [];

  for (const slide of slides) {
    let best: { section: Section; score: number } | null = null;
    for (const section of sections) {
      const score = matchScore(section.heading.richText?.map((run) => run.text).join("") ?? "", slide.text);
      if (!best || score > best.score) best = { section, score };
    }
    if (!best || best.score <= 0 || slide.images.length > 0) continue;
    const heading = best.section.heading.richText?.map((run) => run.text).join("") ?? "";
    if (!isImportantFigure(heading, slide.text, best.section.text)) continue;
    if (best.section.text.includes(MISSING_MARK)) continue;
    if (sectionHasImage(page, best.section.heading.id)) continue;
    findings.push({
      slide: slide.number,
      heading,
      blockId: best.section.heading.id,
      message: `「${heading}」对得上第 ${slide.number} 页，那一页没有图，正文也没有【图缺】。`,
    });
  }

  for (const section of sections) {
    if (!NEEDS_FIGURE.test(section.text)) continue;
    if (section.text.includes(MISSING_MARK)) continue;
    if (sectionHasImage(page, section.heading.id)) continue;
    const heading = section.heading.richText?.map((run) => run.text).join("") ?? "";
    if (findings.some((finding) => finding.blockId === section.heading.id)) continue;
    findings.push({
      heading,
      blockId: section.heading.id,
      message: `「${heading}」写了如图或图示，但这一节没有图片，也没有【图缺】。`,
    });
  }

  return findings;
}

export function placePptFigures(page: PolishPage, slides: PptSlide[]): { page: PolishPage; placements: FigurePlacement[] } {
  const sections = sectionsOf(page);
  const pairs: Array<{ slide: PptSlide; section: Section; score: number }> = [];
  for (const slide of slides) {
    if (slide.images.length === 0) continue;
    for (const section of sections) {
      const heading = section.heading.richText?.map((run) => run.text).join("") ?? "";
      const score = matchScore(heading, slide.text);
      if (score > 0) pairs.push({ slide, section, score });
    }
  }
  pairs.sort((a, b) => b.score - a.score);

  const usedSlides = new Set<number>();
  const usedHeadings = new Set<string>();
  const byHeading = new Map<string, { heading: string; images: PolishPage["blocks"] }>();
  const placements: FigurePlacement[] = [];

  for (const pair of pairs) {
    if (placements.length >= MAX_IMPORTANT_FIGURES) break;
    if (usedSlides.has(pair.slide.number) || usedHeadings.has(pair.section.heading.id)) continue;
    const headingText = pair.section.heading.richText?.map((run) => run.text).join("") ?? "";
    if (!isImportantFigure(headingText, pair.slide.text, pair.section.text)) continue;
    usedSlides.add(pair.slide.number);
    usedHeadings.add(pair.section.heading.id);
    const heading = headingText;
    const images = pair.slide.images.slice(0, 1).map((image, index) => ({
      id: `ppt-${pair.slide.number}-${index}`,
      type: "image" as const,
      url: image.dataUrl,
    }));
    byHeading.set(pair.section.heading.id, { heading, images });
    placements.push({
      slide: pair.slide.number,
      heading,
      headingId: pair.section.heading.id,
      imageCount: images.length,
    });
  }

  const blocks: PolishBlock[] = [];
  for (const block of page.blocks) {
    blocks.push(block);
    const placed = byHeading.get(block.id);
    if (placed) blocks.push(...placed.images);
  }

  return { page: { ...page, blocks }, placements };
}
