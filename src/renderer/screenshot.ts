/**
 * Headless rendering to PNG.
 *
 * This is the capability the rest of the toolkit is built around: an agent
 * calling `preview_page` gets back an actual image, so it can judge a layout
 * instead of guessing at one. The browser is launched once and reused, because
 * an MCP server typically renders several previews in a row while iterating.
 */

import type { Browser } from "playwright";

import type { PolishPage } from "@/core/types";

import { renderComparisonHtml, renderPageToHtml, type HtmlOptions } from "./html";

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = (async () => {
      const { chromium } = await import("playwright");
      return chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
    })();
  }
  try {
    const browser = await browserPromise;
    if (browser.isConnected()) return browser;
  } catch (error) {
    browserPromise = null;
    throw error;
  }
  // Browser died between calls; relaunch once.
  browserPromise = null;
  return getBrowser();
}

export async function closeBrowser(): Promise<void> {
  if (!browserPromise) return;
  const current = browserPromise;
  browserPromise = null;
  try {
    const browser = await current;
    await browser.close();
  } catch {
    // Nothing useful to do if the browser is already gone.
  }
}

export type ShotOptions = {
  width?: number;
  /** Cap on image height; taller pages are cropped from the top. */
  maxHeight?: number;
  deviceScaleFactor?: number;
};

async function shoot(html: string, options: ShotOptions = {}): Promise<Buffer> {
  const { width = 900, maxHeight = 2400, deviceScaleFactor = 1.5 } = options;
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width, height: 1200 },
    deviceScaleFactor,
  });
  try {
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: "load" });
    // Cover images come from Notion's CDN; give them a moment but never hang.
    await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {});

    const fullHeight = await page.evaluate(() => document.body.scrollHeight);
    const height = Math.min(fullHeight, maxHeight);
    // The clip cannot be taller than the viewport, so grow the viewport first.
    await page.setViewportSize({ width, height });

    return (await page.screenshot({
      type: "png",
      clip: { x: 0, y: 0, width, height },
    })) as Buffer;
  } finally {
    await context.close();
  }
}

export async function screenshotPage(page: PolishPage, options: HtmlOptions & ShotOptions = {}) {
  const width = options.width ?? 900;
  const html = renderPageToHtml(page, { ...options, width });
  return shoot(html, { ...options, width });
}

export async function screenshotComparison(
  before: PolishPage,
  after: PolishPage,
  options: {
    paneWidth?: number;
    beforeLabel?: string;
    afterLabel?: string;
    changedIds?: string[];
    addedIds?: string[];
    removedIds?: string[];
  } & ShotOptions = {},
) {
  const paneWidth = options.paneWidth ?? 820;
  const html = renderComparisonHtml(before, after, { ...options, width: paneWidth });
  return shoot(html, { ...options, width: paneWidth * 2 + 1 });
}
