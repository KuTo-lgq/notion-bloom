/**
 * Themes encode taste as data.
 *
 * A theme is not a stylesheet — Notion has no style layer. It is a constrained
 * vocabulary: which colours are allowed, which emoji stands for which kind of
 * aside, and how much structure a page should carry before it needs a table of
 * contents. Restraint is the whole point; a page looks designed because the
 * same three decisions repeat, not because every block is decorated.
 */

import type {
  CalloutIntent,
  NotionBackgroundColor,
  NotionColor,
  NotionTextColor,
  ScoreDimension,
} from "./types";

export type CalloutStyle = {
  emoji: string;
  color: NotionBackgroundColor;
};

export type ThemeStructure = {
  /** Number of H2/H3 headings above which the page should carry a TOC. */
  tocThreshold: number;
  /** Insert a divider before each H2 to separate top level sections. */
  dividerBeforeH2: boolean;
  /** Consecutive plain paragraphs before the page reads as a wall of text. */
  maxConsecutiveParagraphs: number;
  /** Characters in a single paragraph before it should be broken up. */
  maxParagraphChars: number;
  /** Distinct background colours a page may use before it looks noisy. */
  maxDistinctBackgrounds: number;
  /** Distinct callout emoji before the icon set stops reading as a system. */
  maxDistinctCalloutEmojis: number;
  /** Share of body text that may be bold before emphasis stops meaning anything. */
  boldRatioCeiling: number;
  /** Three or four short sibling paragraphs become a row of columns. */
  columnizeShortRuns: boolean;
};

export type Theme = {
  id: string;
  name: string;
  nameEn: string;
  description: string;
  bestFor: string;
  /** Primary accent, used sparingly for emphasis text. */
  accent: NotionTextColor;
  /** Accent background, used for the most important callout on a page. */
  accentBackground: NotionBackgroundColor;
  /** Neutral background for low-emphasis asides. */
  neutralBackground: NotionBackgroundColor;
  headingColors: {
    heading_1: NotionColor;
    heading_2: NotionColor;
    heading_3: NotionColor;
    heading_4: NotionColor;
  };
  quoteColor: NotionColor;
  callouts: Record<CalloutIntent, CalloutStyle>;
  /** Every colour this theme considers in-palette. Anything else is flagged. */
  palette: NotionColor[];
  /** Fallback page icon when no keyword matches the title. */
  fallbackIcon: string;
  /** Notion's own cover gallery — public URLs, no API key, no hosting. */
  coverGallery: string[];
  structure: ThemeStructure;
  /** Short notes shown in the playground and returned by `get_design_spec`. */
  principles: string[];
};

/**
 * Covers are served from Notion's own gallery. These URLs are public and need
 * no credentials, which keeps cover art a zero-dependency feature.
 * Verified reachable by `npm run verify:covers`.
 */
const COVERS = {
  gradientBlue: "https://www.notion.so/images/page-cover/gradients_3.png",
  gradientWarm: "https://www.notion.so/images/page-cover/gradients_8.png",
  gradientViolet: "https://www.notion.so/images/page-cover/gradients_2.png",
  solidBlue: "https://www.notion.so/images/page-cover/solid_blue.png",
  solidBeige: "https://www.notion.so/images/page-cover/solid_beige.png",
  woodcut: "https://www.notion.so/images/page-cover/woodcuts_1.jpg",
  morris: "https://www.notion.so/images/page-cover/met_william_morris_1875.jpg",
  webb: "https://www.notion.so/images/page-cover/webb1.jpg",
} as const;

/** Lecture pages open on an illustrated cover, not the flat beige swatch. */
export const LECTURE_COVER = COVERS.morris;

const CLEAN_DOCS: Theme = {
  id: "clean-docs",
  name: "素雅文档",
  nameEn: "Clean Docs",
  description:
    "近乎全黑白的正文，只用灰底承载旁注、蓝底标记重点。适合需要长期维护、多人协作的文档。",
  bestFor: "团队文档、技术规格、流程手册、知识库",
  accent: "blue",
  accentBackground: "blue_background",
  neutralBackground: "gray_background",
  headingColors: {
    heading_1: "default",
    heading_2: "default",
    heading_3: "gray",
    heading_4: "gray",
  },
  quoteColor: "gray",
  callouts: {
    info: { emoji: "ℹ️", color: "gray_background" },
    key: { emoji: "📌", color: "blue_background" },
    tip: { emoji: "💡", color: "blue_background" },
    warning: { emoji: "⚠️", color: "yellow_background" },
    success: { emoji: "✅", color: "green_background" },
    question: { emoji: "❓", color: "gray_background" },
    quote: { emoji: "🔖", color: "gray_background" },
  },
  palette: [
    "default",
    "gray",
    "blue",
    "red",
    "gray_background",
    "blue_background",
    "yellow_background",
    "green_background",
  ],
  fallbackIcon: "📄",
  coverGallery: [COVERS.gradientBlue, COVERS.solidBlue, COVERS.woodcut],
  structure: {
    tocThreshold: 4,
    dividerBeforeH2: true,
    maxConsecutiveParagraphs: 3,
    maxParagraphChars: 420,
    maxDistinctBackgrounds: 3,
    maxDistinctCalloutEmojis: 4,
    boldRatioCeiling: 0.12,
    columnizeShortRuns: false,
  },
  principles: [
    "正文保持默认黑色，颜色只用来区分「旁注」和「重点」两种角色",
    "每个 H2 前加一条分隔线，让章节在滚动时有明确边界",
    "同一页最多出现 3 种背景色、4 种 callout 图标",
  ],
};

const WARM_NOTES: Theme = {
  id: "warm-notes",
  name: "暖调笔记",
  nameEn: "Warm Notes",
  description:
    "橙褐色系，二级标题带暖色。适合读书笔记、日志、灵感收集这类自己看的页面，允许比文档多一点个性。",
  bestFor: "读书笔记、日记周记、灵感收集、学习笔记",
  accent: "orange",
  accentBackground: "orange_background",
  neutralBackground: "brown_background",
  headingColors: {
    heading_1: "default",
    heading_2: "orange",
    heading_3: "brown",
    heading_4: "brown",
  },
  quoteColor: "brown",
  callouts: {
    info: { emoji: "📝", color: "brown_background" },
    key: { emoji: "🔖", color: "orange_background" },
    tip: { emoji: "🌱", color: "green_background" },
    warning: { emoji: "⚠️", color: "yellow_background" },
    success: { emoji: "🎉", color: "green_background" },
    question: { emoji: "🤔", color: "brown_background" },
    quote: { emoji: "💬", color: "brown_background" },
  },
  palette: [
    "default",
    "brown",
    "orange",
    "gray",
    "brown_background",
    "orange_background",
    "yellow_background",
    "green_background",
  ],
  fallbackIcon: "📒",
  coverGallery: [COVERS.morris, COVERS.woodcut, COVERS.gradientWarm],
  structure: {
    tocThreshold: 5,
    dividerBeforeH2: false,
    maxConsecutiveParagraphs: 4,
    maxParagraphChars: 520,
    maxDistinctBackgrounds: 3,
    maxDistinctCalloutEmojis: 5,
    boldRatioCeiling: 0.18,
    columnizeShortRuns: false,
  },
  principles: [
    "二级标题用暖色，让长笔记在滚动时有节奏感",
    "摘录统一用引用块加褐色，和自己的想法区分开",
    "笔记容忍更多个性，但背景色仍然控制在 3 种以内",
  ],
};

const FOCUS_BRIEF: Theme = {
  id: "focus-brief",
  name: "聚焦简报",
  nameEn: "Focus Brief",
  description:
    "高对比紫蓝配色，结构压得很紧：顶部必有目录与摘要，每节之间必有分隔。适合给别人看、要求几秒抓住重点的页面。",
  bestFor: "周报、评审材料、项目简报、对外发布页",
  accent: "purple",
  accentBackground: "purple_background",
  neutralBackground: "gray_background",
  headingColors: {
    heading_1: "default",
    heading_2: "default",
    heading_3: "purple",
    heading_4: "gray",
  },
  quoteColor: "gray",
  callouts: {
    info: { emoji: "📊", color: "blue_background" },
    key: { emoji: "🎯", color: "purple_background" },
    tip: { emoji: "💡", color: "blue_background" },
    warning: { emoji: "🚨", color: "red_background" },
    success: { emoji: "✅", color: "green_background" },
    question: { emoji: "❓", color: "gray_background" },
    quote: { emoji: "🗣️", color: "gray_background" },
  },
  palette: [
    "default",
    "gray",
    "purple",
    "blue",
    "red",
    "gray_background",
    "purple_background",
    "blue_background",
    "red_background",
    "green_background",
  ],
  fallbackIcon: "🎯",
  coverGallery: [COVERS.gradientViolet, COVERS.webb, COVERS.gradientBlue],
  structure: {
    tocThreshold: 3,
    dividerBeforeH2: true,
    maxConsecutiveParagraphs: 2,
    maxParagraphChars: 320,
    maxDistinctBackgrounds: 4,
    maxDistinctCalloutEmojis: 4,
    boldRatioCeiling: 0.2,
    columnizeShortRuns: true,
  },
  principles: [
    "开头必须有目录，读者三秒内知道这页讲几件事",
    "段落上限更短，宁可拆成列表也不要整段文字",
    "最重要的结论用紫底 🎯 callout，全页只允许一个",
  ],
};

export const THEMES: Theme[] = [CLEAN_DOCS, WARM_NOTES, FOCUS_BRIEF];

export const DEFAULT_THEME_ID = CLEAN_DOCS.id;

export function getTheme(id?: string): Theme {
  if (!id) return CLEAN_DOCS;
  return THEMES.find((t) => t.id === id) ?? CLEAN_DOCS;
}

export function isInPalette(theme: Theme, color: NotionColor | undefined): boolean {
  if (!color || color === "default") return true;
  return theme.palette.includes(color);
}

/**
 * Nudges an off-palette colour to the nearest in-palette one so a recolour op
 * preserves the author's intent (a background stays a background).
 */
export function snapToPalette(theme: Theme, color: NotionColor): NotionColor {
  if (isInPalette(theme, color)) return color;
  if (color.endsWith("_background")) return theme.neutralBackground;
  return theme.accent;
}

export const DIMENSION_WEIGHTS: Record<ScoreDimension, number> = {
  identity: 1,
  hierarchy: 1.4,
  rhythm: 1.4,
  consistency: 1.2,
  navigation: 1,
};
