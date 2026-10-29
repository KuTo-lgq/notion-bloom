/**
 * One call: a deck path in, a Notion lecture page out.
 * The user does not have to supply an outline. A missing deck does not invent one.
 */

import { composeLecture, parseSlide, selectFigures } from "./compose";
import { publishLecture } from "./publish";
import { readDeckFile } from "./read";
import type { Client } from "@notionhq/client";

export async function generateLecture(options: {
  client: Client;
  deckPath: string;
  parentPageId: string;
}): Promise<{ title: string; url: string; id: string; figures: number; sections: number }> {
  const firstPass = await readDeckFile(options.deckPath);
  const picked = selectFigures(firstPass.map(parseSlide));
  const slides = picked.size > 0 && options.deckPath.toLowerCase().endsWith(".pdf")
    ? await readDeckFile(options.deckPath, [...picked])
    : firstPass;
  const lecture = composeLecture(slides);
  const figures = lecture.blocks.filter((block) => block.kind === "image").length;
  const sections = lecture.blocks.filter((block) => block.kind === "heading_2").length;
  const page = await publishLecture({
    client: options.client,
    parentPageId: options.parentPageId,
    title: lecture.title,
    blocks: lecture.blocks,
  });
  return { title: lecture.title, url: page.url, id: page.id, figures, sections };
}
