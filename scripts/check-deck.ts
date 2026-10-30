/**
 * Ingest one deck and run the content gate. Exits 1 with a one-line error
 * when the file is missing, empty, or not a pdf/pptx. Does not call a model.
 *
 *   npx tsx scripts/check-deck.ts examples/fixtures/short.pptx
 */

import { draftFromIngest } from "@/pipeline/draft";
import { reviewContent } from "@/pipeline/gate";
import { ingestDeck } from "@/pipeline/ingest";

async function main() {
  const file = process.argv[2];
  if (!file) {
    process.stderr.write("用法：npx tsx scripts/check-deck.ts <deck.pdf|deck.pptx>\n");
    process.exit(2);
  }
  try {
    const ingest = await ingestDeck(file);
    const gate = reviewContent(draftFromIngest(ingest));
    const state = gate.pass ? "pass" : "fail";
    process.stdout.write(`${ingest.slides.length} slides, content gate ${state}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
});
