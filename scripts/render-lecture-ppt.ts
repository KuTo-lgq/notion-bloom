import { execFile } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { promisify } from "node:util";

import { applyOpsToPage, proposePlan } from "@/core/planner";
import { getSample } from "@/core/samples";
import { extractPptx } from "@/ppt/extract";
import { auditFigures, placePptFigures } from "@/ppt/place";
import { renderComparisonHtml } from "@/renderer/html";
import { closeBrowser, screenshotComparison, screenshotPage } from "@/renderer/screenshot";

const execFileAsync = promisify(execFile);
const PPTX = "/workspace/examples/bayes-lecture.pptx";
const OUT = "/opt/cursor/artifacts";

async function main() {
  await execFileAsync("python3", ["scripts/make_bayes_pptx.py"], { cwd: "/workspace" });
  const page = getSample("sample-bayes-lecture");
  if (!page) throw new Error("missing sample");
  const slides = await extractPptx(await readFile(PPTX));
  const beautified = applyOpsToPage(page, proposePlan(page, { themeId: "clean-docs" }).ops);
  const illustrated = placePptFigures(beautified, slides);
  const missing = auditFigures(beautified, slides);
  console.log(
    "slides",
    slides.map((slide) => `${slide.number}:${slide.text}:${slide.images.length}`).join(" | "),
  );
  console.log("placements", illustrated.placements);
  console.log("missing", missing);

  await mkdir(OUT, { recursive: true });
  const comparison = await screenshotComparison(page, illustrated.page, {
    beforeLabel: "改前 · 没有配图",
    afterLabel: "改后 · 美化并配上 PPT 的图",
    paneWidth: 880,
    maxHeight: 9000,
    deviceScaleFactor: 2,
  });
  const after = await screenshotPage(illustrated.page, {
    label: "改后",
    width: 920,
    maxHeight: 9000,
    deviceScaleFactor: 2,
  });
  const html = renderComparisonHtml(page, illustrated.page, {
    width: 880,
    beforeLabel: "改前 · 没有配图",
    afterLabel: "改后 · 美化并配上 PPT 的图",
  });
  await writeFile(`${OUT}/bayes_with_ppt_comparison.png`, comparison);
  await writeFile(`${OUT}/bayes_with_ppt_after.png`, after);
  await writeFile(`${OUT}/bayes_with_ppt_comparison.html`, html);
  console.log("wrote", `${OUT}/bayes_with_ppt_comparison.png`);
  await closeBrowser();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
