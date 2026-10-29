/**
 * Normalized block model used across the toolkit.
 *
 * This is deliberately a *subset* of the Notion API block schema. The toolkit
 * only promises to understand the block types that carry visual weight, and
 * everything else is passed through untouched so that an audit never destroys
 * content it cannot reason about.
 */

export const NOTION_TEXT_COLORS = [
  "default",
  "gray",
  "brown",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
  "red",
] as const;

export const NOTION_BACKGROUND_COLORS = [
  "gray_background",
  "brown_background",
  "orange_background",
  "yellow_background",
  "green_background",
  "blue_background",
  "purple_background",
  "pink_background",
  "red_background",
] as const;

export type NotionTextColor = (typeof NOTION_TEXT_COLORS)[number];
export type NotionBackgroundColor = (typeof NOTION_BACKGROUND_COLORS)[number];
export type NotionColor = NotionTextColor | NotionBackgroundColor;

export const ALL_NOTION_COLORS: readonly NotionColor[] = [
  ...NOTION_TEXT_COLORS,
  ...NOTION_BACKGROUND_COLORS,
];

export function isBackgroundColor(color: NotionColor): color is NotionBackgroundColor {
  return color.endsWith("_background");
}

/** Block types the toolkit reads, scores and rewrites. */
export const SUPPORTED_BLOCK_TYPES = [
  "paragraph",
  "heading_1",
  "heading_2",
  "heading_3",
  // The API exposes heading_4 as of the 2026-03-11 version.
  "heading_4",
  "bulleted_list_item",
  "numbered_list_item",
  "to_do",
  "toggle",
  "callout",
  "quote",
  "code",
  "divider",
  "image",
  "bookmark",
  "table_of_contents",
  "column_list",
  "column",
  "breadcrumb",
  "equation",
  "unsupported",
] as const;

export type BlockType = (typeof SUPPORTED_BLOCK_TYPES)[number];

export type RichText = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  color?: NotionColor;
  href?: string;
  /** Set when this run is an inline equation. `text` mirrors the expression. */
  equation?: string;
};

export type BlockIcon =
  | { type: "emoji"; emoji: string }
  | { type: "external"; url: string };

export type PolishBlock = {
  id: string;
  type: BlockType;
  /** Inline content. Absent for structural blocks such as `divider`. */
  richText?: RichText[];
  /** Block level colour. `undefined` is treated as `default`. */
  color?: NotionColor;
  icon?: BlockIcon;
  /** Code block language, e.g. `typescript`. */
  language?: string;
  checked?: boolean;
  url?: string;
  caption?: RichText[];
  expression?: string;
  children?: PolishBlock[];
  /** Original Notion type when `type` is `unsupported`. */
  originalType?: string;
};

/**
 * A database formula property on the page. The expression lives on the data
 * source; the page only carries the computed value. `valueUnsupported` is the
 * API's own signal that it could not evaluate the formula.
 */
export type PropertyFormula = {
  name: string;
  expression: string;
  valueUnsupported: boolean;
};

export type PolishPage = {
  id: string;
  title: string;
  icon?: BlockIcon;
  cover?: string;
  blocks: PolishBlock[];
  url?: string;
  propertyFormulas?: PropertyFormula[];
};

/** Semantic role a callout plays, used to pick an emoji and colour per theme. */
export const CALLOUT_INTENTS = [
  "info",
  "key",
  "tip",
  "warning",
  "success",
  "question",
  "quote",
] as const;

export type CalloutIntent = (typeof CALLOUT_INTENTS)[number];

/** Scoring dimensions. Each audit rule contributes to exactly one. */
export const SCORE_DIMENSIONS = [
  "identity",
  "hierarchy",
  "rhythm",
  "consistency",
  "navigation",
] as const;

export type ScoreDimension = (typeof SCORE_DIMENSIONS)[number];

export const DIMENSION_LABELS: Record<ScoreDimension, { zh: string; en: string; blurb: string }> = {
  identity: {
    zh: "页面标识",
    en: "Identity",
    blurb: "图标、封面、标题 — 决定页面在侧边栏和链接预览里的第一印象",
  },
  hierarchy: {
    zh: "信息层级",
    en: "Hierarchy",
    blurb: "标题是否成体系、有无跳级、长页面有无切分",
  },
  rhythm: {
    zh: "视觉节奏",
    en: "Rhythm",
    blurb: "留白、分隔、段落长度 — 决定读起来累不累",
  },
  consistency: {
    zh: "风格一致",
    en: "Consistency",
    blurb: "配色与图标是否克制统一，而不是每段一个花样",
  },
  navigation: {
    zh: "可导航性",
    en: "Navigation",
    blurb: "目录、锚点、折叠 — 长页面能不能快速跳转",
  },
};

export type Severity = "high" | "medium" | "low";

/**
 * Deduction per finding, out of 100 per dimension.
 *
 * Calibrated so that a page with the common damage — no icon, no cover, H1
 * used as section headings, five random background colours, no table of
 * contents — lands in the 40s rather than the high 80s. A score that calls
 * every page an A is worse than no score: an agent cannot steer by it.
 */
export const SEVERITY_WEIGHT: Record<Severity, number> = {
  high: 30,
  medium: 14,
  low: 5,
};
