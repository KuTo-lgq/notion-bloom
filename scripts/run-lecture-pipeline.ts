/**
 * Same path as the run_lecture_pipeline MCP tool.
 *
 *   npx tsx scripts/run-lecture-pipeline.ts --pptx ./fixtures/lesson-step.pptx
 *   npx tsx scripts/run-lecture-pipeline.ts --pptx ./deck.pptx --draft ./lecture.json --publish
 *
 * Without --draft the command prints a skeleton and does not write.
 * The lecture body is the Agent's job. This process does not call a model.
 * --publish writes a child of NOTION_PARENT_PAGE_ID. There is no built-in page.
 * A failing content gate is not published unless --review is also set.
 * --review still refuses bloom. --apply beautifies only after the gate passes.
 */

import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { writeLongLecture } from "@/pipeline/long-deck";
import { writeMiniLecture } from "@/pipeline/mini-deck";
import { runLecturePipeline } from "@/pipeline/run";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const given = arg("--pptx") ?? arg("--pdf");
  const publish = process.argv.includes("--publish");
  const review = process.argv.includes("--review");
  const apply = process.argv.includes("--apply");
  const long = process.argv.includes("--long");
  const dir = await mkdtemp(path.join(tmpdir(), "bloom-lecture-"));
  const deckPath = given ?? path.join(dir, long ? "long-lecture.pptx" : "mini-lecture.pptx");
  if (!given) {
    if (long) await writeLongLecture(deckPath);
    else await writeMiniLecture(deckPath);
  }
  const draftPath = arg("--draft");
  const draft = draftPath ? (JSON.parse(await readFile(draftPath, "utf8")) as unknown) : undefined;
  const result = await runLecturePipeline({
    deckPath,
    draft,
    parentPageId: publish && draft ? process.env.NOTION_PARENT_PAGE_ID : undefined,
    review: publish && review,
    apply: publish && apply,
    title: arg("--title"),
    themeId: arg("--theme"),
  });
  console.log(JSON.stringify(result, null, 2));
  if (result.role === "draft" && !result.gate.pass && !(publish && review && result.published)) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
