/**
 * Server-side rendering to a standalone HTML document.
 *
 * Deliberately self-contained: the stylesheet is inlined so the output can be
 * handed straight to a headless browser with `setContent`, with no dev server
 * running and no network fetch for CSS.
 */

import { renderToStaticMarkup } from "react-dom/server";

import type { PolishPage } from "@/core/types";

import { NotionPreview, type RenderOptions } from "./blocks";
import { NOTION_CSS } from "./css";

export type HtmlOptions = RenderOptions & {
  /** Viewport width in px. 900 leaves Notion's 708px column plus margins. */
  width?: number;
  /** Optional caption strip, e.g. "BEFORE 评分 48". */
  label?: string;
};

export function renderPageToHtml(page: PolishPage, options: HtmlOptions = {}): string {
  const { width = 900, label, ...renderOptions } = options;
  const body = renderToStaticMarkup(NotionPreview({ page, options: renderOptions }));

  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=${width}" />
<title>${escapeHtml(page.title)}</title>
<style>
  html, body { margin: 0; padding: 0; background: #fff; }
  .np-shot { width: ${width}px; }
  .np-label {
    font-family: ui-sans-serif, -apple-system, "Segoe UI", sans-serif;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: rgba(55, 53, 47, 0.55);
    background: rgb(247, 246, 243);
    border-bottom: 1px solid rgba(55, 53, 47, 0.1);
    padding: 8px 24px;
  }
${NOTION_CSS}
</style>
</head>
<body>
<div class="np-shot">
${label ? `<div class="np-label">${escapeHtml(label)}</div>` : ""}
${body}
</div>
</body>
</html>`;
}

/**
 * Before and after in a single image. One picture an agent can look at once
 * beats two it has to hold in its head and compare.
 */
export function renderComparisonHtml(
  before: PolishPage,
  after: PolishPage,
  options: {
    width?: number;
    beforeLabel?: string;
    afterLabel?: string;
    changedIds?: string[];
    addedIds?: string[];
    removedIds?: string[];
  } = {},
): string {
  const {
    width = 820,
    beforeLabel = "BEFORE",
    afterLabel = "AFTER",
    changedIds = [],
    addedIds = [],
    removedIds = [],
  } = options;

  const left = renderToStaticMarkup(
    NotionPreview({
      page: before,
      options: { changedIds: [...changedIds, ...removedIds], annotate: true },
    }),
  );
  const right = renderToStaticMarkup(
    NotionPreview({ page: after, options: { changedIds, addedIds, annotate: true } }),
  );

  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(after.title)} — before / after</title>
<style>
  html, body { margin: 0; padding: 0; background: rgb(235, 235, 233); }
  .np-compare { display: flex; align-items: flex-start; gap: 1px; width: ${width * 2 + 1}px; }
  .np-pane { width: ${width}px; background: #fff; }
  .np-label {
    font-family: ui-sans-serif, -apple-system, "Segoe UI", sans-serif;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.08em;
    color: rgba(55, 53, 47, 0.6);
    background: rgb(247, 246, 243);
    border-bottom: 1px solid rgba(55, 53, 47, 0.1);
    padding: 10px 24px;
    position: sticky;
    top: 0;
  }
  .np-pane[data-side="after"] .np-label { color: rgb(51, 126, 169); background: rgb(231, 243, 248); }
${NOTION_CSS}
</style>
</head>
<body>
<div class="np-compare">
  <div class="np-pane" data-side="before">
    <div class="np-label">${escapeHtml(beforeLabel)}</div>
    ${left}
  </div>
  <div class="np-pane" data-side="after">
    <div class="np-label">${escapeHtml(afterLabel)}</div>
    ${right}
  </div>
</div>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
