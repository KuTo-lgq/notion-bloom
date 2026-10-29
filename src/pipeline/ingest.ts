/**
 * First stage. Reads a pdf or pptx into slide titles, text, and whether a
 * picture is on the page. It does not write a lecture and does not call Notion.
 */

import path from "node:path";

import { parseSlide } from "@/deck/compose";
import { readDeckFile } from "@/deck/read";

import { renderPdfSlides, renderPptxSlides } from "./render-pptx";
import type { DeckIngest } from "./types";

export async function ingestDeck(sourcePath: string): Promise<DeckIngest> {
  const slides = await readDeckFile(sourcePath);
  const ext = path.extname(sourcePath).toLowerCase();
  const rendered =
    ext === ".pptx"
      ? await renderPptxSlides(sourcePath).catch(() => new Map<number, string>())
      : ext === ".pdf"
        ? await renderPdfSlides(sourcePath).catch(() => new Map<number, string>())
        : new Map<number, string>();
  return {
    sourcePath,
    slides: slides.map((slide) => {
      const parsed = parseSlide(slide);
      const bodyLines = parsed.lines.slice(2);
      const body = bodyLines.join("\n") || parsed.readable.join("\n") || parsed.title;
      const imageFile = rendered.get(slide.number);
      return {
        number: slide.number,
        title: parsed.title,
        chapter: parsed.kicker || parsed.title,
        text: body,
        hasImage: Boolean(imageFile),
        embedded: ext === ".pptx" && (slide.images ?? 0) > 0,
        imageFile,
      };
    }),
  };
}
