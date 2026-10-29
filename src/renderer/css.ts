/**
 * Notion's light-mode visual constants.
 *
 * These values are measured from Notion's own rendering rather than invented.
 * The renderer is explicitly an *approximation* — it covers layout, colour and
 * rhythm, which is what the audit reasons about. It is not pixel-perfect and
 * does not try to be: fonts and exact block padding will differ slightly.
 */

import type { NotionColor } from "@/core/types";

export const NOTION_TEXT_RGB: Record<string, string> = {
  default: "rgb(55, 53, 47)",
  gray: "rgb(120, 119, 116)",
  brown: "rgb(159, 107, 83)",
  orange: "rgb(217, 115, 13)",
  yellow: "rgb(203, 145, 47)",
  green: "rgb(68, 131, 97)",
  blue: "rgb(51, 126, 169)",
  purple: "rgb(144, 101, 176)",
  pink: "rgb(193, 76, 138)",
  red: "rgb(212, 76, 71)",
};

export const NOTION_BG_RGB: Record<string, string> = {
  gray_background: "rgb(241, 241, 239)",
  brown_background: "rgb(244, 238, 238)",
  orange_background: "rgb(251, 236, 221)",
  yellow_background: "rgb(251, 243, 219)",
  green_background: "rgb(237, 243, 236)",
  blue_background: "rgb(231, 243, 248)",
  purple_background: "rgb(244, 240, 247)",
  pink_background: "rgb(249, 238, 243)",
  red_background: "rgb(253, 235, 236)",
};

/** Resolves a Notion colour token to the inline style it should produce. */
export function colorStyle(color?: NotionColor): { color?: string; backgroundColor?: string } {
  if (!color || color === "default") return {};
  if (color.endsWith("_background")) {
    return { backgroundColor: NOTION_BG_RGB[color] };
  }
  return { color: NOTION_TEXT_RGB[color] };
}

/**
 * Scoped under `.np-root` so the same stylesheet can be inlined into a
 * standalone HTML document for screenshots and imported into the playground
 * without colliding with Tailwind.
 */
export const NOTION_CSS = `
.np-root {
  --np-text: rgb(55, 53, 47);
  --np-text-soft: rgba(55, 53, 47, 0.65);
  --np-text-faint: rgba(55, 53, 47, 0.4);
  --np-rule: rgba(55, 53, 47, 0.16);
  --np-code-bg: rgb(247, 246, 243);
  --np-inline-code-bg: rgba(135, 131, 120, 0.15);
  --np-inline-code-fg: rgb(235, 87, 87);
  --np-content-width: 708px;

  background: #ffffff;
  color: var(--np-text);
  font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica,
    "Apple Color Emoji", Arial, sans-serif, "Segoe UI Emoji", "Segoe UI Symbol";
  font-size: 16px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  text-align: left;
}

.np-root *,
.np-root *::before,
.np-root *::after {
  box-sizing: border-box;
}

/* ---------------------------------------------------------------- chrome */

.np-cover {
  width: 100%;
  height: 180px;
  background-size: cover;
  background-position: center 50%;
  background-color: rgb(241, 241, 239);
}

.np-cover-empty {
  height: 48px;
}

.np-header {
  max-width: var(--np-content-width);
  margin: 0 auto;
  padding: 0 24px;
}

.np-page-icon {
  font-size: 72px;
  line-height: 1;
  margin-top: -36px;
  margin-bottom: 8px;
  height: 78px;
  display: flex;
  align-items: flex-end;
}

.np-page-icon-empty {
  height: 24px;
  margin-top: 0;
}

.np-title {
  font-size: 40px;
  font-weight: 700;
  line-height: 1.2;
  margin: 0 0 8px;
  color: var(--np-text);
  letter-spacing: -0.01em;
}

.np-body {
  max-width: var(--np-content-width);
  margin: 0 auto;
  padding: 8px 24px 96px;
}

/* ---------------------------------------------------------------- blocks */

.np-block {
  position: relative;
}

.np-p {
  margin: 2px 0;
  padding: 3px 2px;
  min-height: 1.5em;
  white-space: pre-wrap;
  word-break: break-word;
}

.np-h1 {
  font-size: 30px;
  font-weight: 600;
  line-height: 1.3;
  margin: 32px 0 1px;
  padding: 3px 2px;
}

.np-h2 {
  font-size: 24px;
  font-weight: 600;
  line-height: 1.3;
  margin: 21px 0 1px;
  padding: 3px 2px;
}

.np-h3 {
  font-size: 20px;
  font-weight: 600;
  line-height: 1.3;
  margin: 16px 0 1px;
  padding: 3px 2px;
}

.np-h4 {
  font-size: 17px;
  font-weight: 600;
  line-height: 1.3;
  margin: 12px 0 1px;
  padding: 3px 2px;
}

.np-li {
  margin: 1px 0;
  padding: 3px 2px;
  padding-left: 2px;
  display: flex;
  gap: 6px;
  align-items: flex-start;
}

.np-li-marker {
  flex: 0 0 22px;
  text-align: center;
  user-select: none;
  padding-top: 1px;
}

.np-li-bullet-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--np-text);
  vertical-align: 0.35em;
}

.np-li-content {
  flex: 1 1 auto;
  min-width: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

.np-checkbox {
  width: 16px;
  height: 16px;
  border-radius: 3px;
  border: 1.3px solid rgba(55, 53, 47, 0.45);
  display: inline-block;
  position: relative;
  margin-top: 3px;
}

.np-checkbox[data-checked="true"] {
  background: rgb(35, 131, 226);
  border-color: rgb(35, 131, 226);
}

.np-checkbox[data-checked="true"]::after {
  content: "";
  position: absolute;
  left: 4.5px;
  top: 1.5px;
  width: 4px;
  height: 8px;
  border: solid #fff;
  border-width: 0 1.8px 1.8px 0;
  transform: rotate(40deg);
}

.np-checked-text {
  color: var(--np-text-faint);
  text-decoration: line-through;
}

.np-callout {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 16px 16px 16px 14px;
  border-radius: 4px;
  margin: 4px 0;
  background: rgb(241, 241, 239);
}

.np-callout-icon {
  flex: 0 0 auto;
  font-size: 16px;
  line-height: 1.5;
  width: 20px;
  text-align: center;
}

.np-callout-body {
  flex: 1 1 auto;
  min-width: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

.np-quote {
  border-left: 3px solid currentColor;
  padding: 2px 0 2px 14px;
  margin: 6px 0;
  white-space: pre-wrap;
}

.np-code {
  background: var(--np-code-bg);
  border-radius: 4px;
  padding: 26px 32px 26px 28px;
  margin: 4px 0;
  overflow-x: auto;
  position: relative;
}

.np-code pre {
  margin: 0;
  font-family: "SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace;
  font-size: 13.6px;
  line-height: 1.5;
  tab-size: 2;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--np-text);
}

.np-code-lang {
  position: absolute;
  top: 6px;
  right: 10px;
  font-size: 11px;
  color: var(--np-text-faint);
  font-family: "SFMono-Regular", Menlo, Consolas, monospace;
  text-transform: lowercase;
}

.np-code-lang[data-plain="true"] {
  color: rgb(212, 76, 71);
}

.np-divider {
  height: 13px;
  margin: 2px 0;
  display: flex;
  align-items: center;
}

.np-divider::after {
  content: "";
  display: block;
  width: 100%;
  border-bottom: 1px solid var(--np-rule);
}

.np-toc {
  margin: 4px 0;
  padding: 3px 2px;
}

.np-toc-item {
  padding: 3px 2px;
  color: var(--np-text);
  text-decoration: underline;
  text-decoration-color: var(--np-rule);
  text-underline-offset: 3px;
}

.np-toc-item[data-level="3"] {
  padding-left: 24px;
  font-size: 14px;
}

.np-toc-item[data-level="4"] {
  padding-left: 44px;
  font-size: 14px;
}

.np-toc-empty {
  color: var(--np-text-faint);
  font-size: 14px;
}

.np-toggle {
  margin: 1px 0;
  padding: 3px 2px;
}

.np-toggle-head {
  display: flex;
  gap: 6px;
  align-items: flex-start;
}

.np-toggle-arrow {
  flex: 0 0 22px;
  text-align: center;
  color: var(--np-text-soft);
  font-size: 10px;
  padding-top: 5px;
}

.np-toggle-children,
.np-children {
  padding-left: 28px;
}

.np-image {
  margin: 6px 0;
}

.np-image img {
  max-width: 100%;
  border-radius: 3px;
  display: block;
}

.np-image-placeholder {
  background: rgb(241, 241, 239);
  border-radius: 3px;
  padding: 40px 16px;
  text-align: center;
  color: var(--np-text-faint);
  font-size: 13px;
}

.np-caption {
  font-size: 12px;
  color: var(--np-text-soft);
  margin-top: 6px;
  padding: 0 2px;
}

.np-bookmark {
  border: 1px solid var(--np-rule);
  border-radius: 4px;
  padding: 12px 14px;
  margin: 4px 0;
  font-size: 14px;
}

.np-bookmark-url {
  color: var(--np-text-soft);
  font-size: 12px;
  margin-top: 4px;
  word-break: break-all;
}

.np-breadcrumb {
  color: var(--np-text-soft);
  font-size: 14px;
  padding: 3px 2px;
}

.np-equation {
  text-align: center;
  padding: 8px 2px;
  font-family: "Times New Roman", serif;
  font-style: italic;
  font-size: 17px;
}

.np-unsupported {
  border: 1px dashed var(--np-rule);
  border-radius: 4px;
  padding: 10px 12px;
  margin: 4px 0;
  color: var(--np-text-faint);
  font-size: 13px;
}

/* ---------------------------------------------------------- inline marks */

.np-code-inline {
  background: var(--np-inline-code-bg);
  color: var(--np-inline-code-fg);
  border-radius: 3px;
  padding: 0.2em 0.4em;
  font-family: "SFMono-Regular", Menlo, Consolas, monospace;
  font-size: 85%;
}

.np-link {
  color: inherit;
  text-decoration: underline;
  text-decoration-color: var(--np-text-faint);
  text-underline-offset: 2px;
}

/* --------------------------------------------------- change highlighting */

.np-block[data-changed="true"]::before {
  content: "";
  position: absolute;
  left: -14px;
  top: 2px;
  bottom: 2px;
  width: 3px;
  border-radius: 2px;
  background: rgb(35, 131, 226);
}

.np-block[data-changed="added"]::before {
  background: rgb(68, 131, 97);
}

/*
 * Only the left rail marks a change — no background tint. A tinted block reads
 * as "this block's colour was changed", which is a different claim and was
 * actively misleading on heading-level fixes.
 */
.np-root[data-annotate="true"] .np-block[data-changed="true"]::before,
.np-root[data-annotate="true"] .np-block[data-changed="added"]::before {
  left: -16px;
  width: 4px;
}
`;
