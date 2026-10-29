/**
 * Turns a deck into a lecture: every content slide becomes a section, and only
 * a few important figures are attached. The wording on the slide is kept.
 * Broken formula fragments are left out instead of being copied as fake math.
 */

import { isImportantFigure } from "@/ppt/place";

export type DeckSlide = {
  number: number;
  footer: string;
  lines: string[];
  drawings: number;
  /** Embedded pictures on the page. A full-slide chart counts; vector text does not. */
  images?: number;
  imageFile?: string | null;
};

export type LectureBlock =
  | { kind: "heading_1" | "heading_2"; text: string }
  | { kind: "paragraph" | "bulleted_list_item"; text: string }
  | { kind: "equation"; expression: string }
  | { kind: "callout"; emoji: string; color: "blue_background" | "orange_background" | "yellow_background" | "gray_background"; text: string }
  | { kind: "divider" }
  | { kind: "table_of_contents" }
  | { kind: "image"; file: string; caption: string };

const MAX_FIGURES = 6;
const SKIP_SLIDE = /references|thank you|参考文献|谢谢|目录|导览|议程|agenda|contents|pause & think|^break\b/i;

export type ParsedSlide = DeckSlide & {
  kicker: string;
  title: string;
  readable: string[];
  formulaHeavy: boolean;
  skipped: boolean;
};

function footerNumber(footer: string): number | null {
  const match = footer.match(/(\d+)\s*\/\s*\d+/);
  return match ? Number(match[1]) : null;
}

function isChrome(line: string): boolean {
  if (/original teaching illustration/i.test(line)) return true;
  if (/^\d+\s*\/\s*\d+$/.test(line)) return true;
  if (/AMA\s*564\s*·\s*Deep Learning/i.test(line)) return true;
  return false;
}

export function parseSlide(slide: DeckSlide): ParsedSlide {
  const kicker = slide.lines[0] ?? "";
  const rest = slide.lines.slice(1).filter((line) => !isChrome(line));
  const title = rest[0] ?? kicker;
  const body = rest.slice(1).filter((line) => line !== title);
  const readable = body.filter(isReadable).slice(0, 12);
  const shortLines = body.filter((line) => line.length < 8).length;
  const formulaHeavy = shortLines >= 6 || (body.length > 0 && shortLines / body.length > 0.45);
  const skipped = SKIP_SLIDE.test(`${kicker}\n${title}`) || /references/i.test(kicker);
  return { ...slide, kicker, title, readable, formulaHeavy, skipped };
}

function isReadable(line: string): boolean {
  const words = line.match(/[A-Za-z\u4e00-\u9fff]{3,}/g);
  if (!words) return false;
  const letters = words.join("").length;
  return letters >= 12 || (words.length >= 2 && letters >= 8);
}

function sectionName(kicker: string): string {
  const text = kicker.toUpperCase();
  if (text.includes("STOCHASTIC")) return "随机梯度下降";
  if (text.includes("ROBUST")) return "稳健损失";
  if (text.includes("QUANTILE")) return "分位数回归";
  if (text.includes("STATISTICAL")) return "损失决定的统计目标";
  if (text.includes("PUTTING")) return "把训练和损失合在一起";
  if (text.includes("FOUNDATION")) return "把训练问题写清楚";
  if (text.includes("OPTIONAL")) return "选读";
  if (text.includes("GRADIENT")) return "梯度下降";
  const cleaned = kicker.replace(/·.*$/, "").trim();
  return cleaned || "本讲";
}

function gloss(title: string): string | null {
  const table: Array<[RegExp, string]> = [
    [/overshoot|too large/i, "方向对了也不够。步长太大，下一步会越过最优点，甚至发散。"],
    [/curvature|ill-conditioned/i, "各个方向弯得不一样时，一个共用步长会在陡的地方振荡，在平的地方爬得很慢。"],
    [/uphill|at the minimum/i, "人已经站在最低点时，抽到的单个样本仍然可能把损失往上推。无偏只保证平均是对的。"],
    [/gradient work|same amount/i, "比的是用了多少次样本梯度，不是墙钟时间。小批量往往更早靠近解，但曲线更抖。"],
    [/learning curve/i, "先看训练曲线和验证曲线，再决定是步长、初始化，还是模型本身的问题。"],
    [/outlier|fitted line|move one point/i, "一个离群点就能把平方损失的拟合线拽歪。换 Huber，大残差的拉力被限住。"],
    [/derivative|residual score|compare the loss/i, "更新看的是损失对残差的导数，不是损失有多高。不同损失推残差的方式不一样。"],
    [/pinball|quantile|underpredict/i, "要预测的不是一个中心，而是某个分位。τ 越大，低估的惩罚越重。"],
    [/unbiased/i, "无偏是说：在走这一步之前，小批量梯度的条件期望等于全量梯度。"],
    [/variance/i, "把独立样本的梯度做平均，方差按批量大小缩小。"],
    [/smooth|descent lemma|lipschitz/i, "梯度变化被 L 管住时，损失的上升也有二次上界，所以步长可以选 1/L。"],
    [/checkpoint/i, "先盖住答案自己算一遍，再对照这一页。"],
    [/definition|we define|is defined/i, "这里是定义。后面的推导都从这一句出发。"],
    [/theorem|guarantee|proof/i, "这里是能证明的结论。条件不满足时，这个保证不能直接搬过来。"],
  ];
  for (const [pattern, sentence] of table) {
    if (pattern.test(title)) return sentence;
  }
  return null;
}

function calloutFor(title: string, readable: string[]): LectureBlock | null {
  const blob = `${title}\n${readable.join("\n")}`;
  if (/checkpoint/i.test(blob)) {
    return { kind: "callout", emoji: "🎯", color: "orange_background", text: `考点 Checkpoint · ${title}` };
  }
  if (/definition|we define|is defined/i.test(blob)) {
    return { kind: "callout", emoji: "📘", color: "blue_background", text: `定义 Definition · ${title}` };
  }
  if (/warning|do not|cannot|不/i.test(title)) {
    return { kind: "callout", emoji: "⚠️", color: "yellow_background", text: `注意 · ${title}` };
  }
  return null;
}

function figureScore(slide: ParsedSlide): number {
  const important = isImportantFigure(slide.title, slide.lines.join("\n"), slide.readable.join("\n"));
  const pictures = slide.images ?? 0;
  const optional = /optional|reference/i.test(slide.kicker) ? 40 : 0;
  const thin = slide.readable.length < 2 ? 12 : 0;
  const chart = /overshoot|curvature|uphill|learning curve|outlier|fitted|derivatives|predicted curve|quantile curve|noise floor|gradient work/i.test(
    slide.title,
  )
    ? 18
    : 0;
  if (pictures > 0) return 40 + chart + (important ? 10 : 0) + Math.min(slide.drawings, 8) - optional - thin;
  if (slide.formulaHeavy || important) return 10 + Math.min(slide.drawings, 8) + (important ? 6 : 0) - optional;
  return 0;
}

/** One figure per part of the lecture, then fill gaps. Never a run of neighboring pages. */
export function selectFigures(slides: ParsedSlide[]): Set<number> {
  const usable = slides.filter((slide) => !slide.skipped && slide.number > 1);
  const hasPictures = usable.some((slide) => (slide.images ?? 0) > 0);
  const ranked = usable
    .map((slide) => ({ slide, score: figureScore(slide) }))
    .filter((item) => item.score >= (hasPictures ? 58 : 10))
    .sort((a, b) => b.score - a.score || a.slide.number - b.slide.number);

  const picked: ParsedSlide[] = [];
  const tooClose = (number: number) => picked.some((slide) => Math.abs(slide.number - number) < 2);

  const groups = new Map<string, typeof ranked>();
  for (const item of ranked) {
    const key = sectionName(item.slide.kicker);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  const bestPerSection = [...groups.values()]
    .map((group) => group[0])
    .sort((a, b) => b.score - a.score);
  for (const item of bestPerSection) {
    if (picked.length >= MAX_FIGURES) break;
    if (tooClose(item.slide.number)) continue;
    picked.push(item.slide);
  }
  for (const item of ranked) {
    if (picked.length >= MAX_FIGURES) break;
    if (picked.some((slide) => slide.number === item.slide.number) || tooClose(item.slide.number)) continue;
    picked.push(item.slide);
  }
  return new Set(picked.map((slide) => slide.number));
}

export function composeLecture(slides: DeckSlide[]): { title: string; blocks: LectureBlock[] } {
  const parsed = slides.map(parseSlide);
  const figures = selectFigures(parsed);
  const first = parsed[0];
  const titleSource = first ? [first.title, ...first.readable].filter(Boolean).slice(0, 2).join(" ") : "课程讲解";
  const title = `课件生成｜${titleSource}`.slice(0, 180);

  const blocks: LectureBlock[] = [
    {
      kind: "callout",
      emoji: "📍",
      color: "yellow_background",
      text: "本页由课件直接生成。每一节对应一页幻灯片，课件上能读成句子的话都保留。公式以配上的图为准，抽坏的式子没有写进来。只截了关键图：公式、曲线、算法和考点示意图。",
    },
    { kind: "table_of_contents" },
  ];

  const roadmap = parsed.find((slide) => /how do we train/i.test(slide.lines.join("\n")));
  if (roadmap) {
    blocks.push({
      kind: "callout",
      emoji: "🧭",
      color: "blue_background",
      text: `本讲要回答的问题：${roadmap.readable.join(" ")}`.slice(0, 1800),
    });
  }

  let currentKicker = "";
  for (const slide of parsed) {
    if (slide.skipped || slide.number === 1) continue;
    const dividerOnly = /^\d+$/.test(slide.kicker.trim());
    if (!dividerOnly && slide.kicker !== currentKicker) {
      currentKicker = slide.kicker;
      const name = sectionName(slide.kicker);
      blocks.push({ kind: "heading_1", text: name });
      blocks.push({
        kind: "paragraph",
        text: /选读/.test(name) ? "这一部分是选读，对应课件后面的补充页。" : `这一部分讲${name}。`,
      });
    }
    const slideNo = footerNumber(slide.footer) ?? slide.number;
    blocks.push({ kind: "heading_2", text: `${slide.title}（课件第 ${slide.number} 页 · slide ${slideNo}）`.slice(0, 1800) });
    const note = gloss(slide.title);
    if (note) blocks.push({ kind: "paragraph", text: note });
    const marked = calloutFor(slide.title, slide.readable);
    if (marked) blocks.push(marked);
    if (figures.has(slide.number) && slide.imageFile) {
      blocks.push({
        kind: "image",
        file: slide.imageFile,
        caption: `课件第 ${slide.number} 页 Slide ${slideNo}。`,
      });
    }
    if (slide.readable.length === 0) {
      blocks.push({
        kind: "paragraph",
        text: `课件第 ${slide.number} 页主要是公式或示意图，抽出来的式子是碎的，这里不把碎式子当成原文。`,
      });
      continue;
    }
    for (const line of slide.readable) blocks.push({ kind: "bulleted_list_item", text: line.slice(0, 1800) });
  }

  return { title, blocks };
}
