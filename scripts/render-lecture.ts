import { mkdir, writeFile } from "node:fs/promises";

import { audit, formatAuditSummary } from "@/core/audit";
import { opTargets } from "@/core/diff";
import { applyOpsToPage, projectPlan, proposePlan } from "@/core/planner";
import { getSample } from "@/core/samples";
import { closeBrowser, screenshotComparison, screenshotPage } from "@/renderer/screenshot";
import { renderComparisonHtml } from "@/renderer/html";

const OUT = "/opt/cursor/artifacts";

async function main() {
  const page = getSample("sample-bayes-lecture");
  if (!page) throw new Error("missing lecture sample");
  const themeId = "clean-docs";
  const before = audit(page, themeId);
  const plan = proposePlan(page, { themeId });
  const projection = projectPlan(page, plan.ops, themeId);
  const after = applyOpsToPage(page, plan.ops);
  const targets = opTargets(plan.ops);

  console.log(formatAuditSummary(before));
  console.log(`score ${projection.before.overall} -> ${projection.after.overall} (${projection.delta})`);
  for (const line of plan.diff) console.log(" -", line);

  await mkdir(OUT, { recursive: true });
  const comparison = await screenshotComparison(page, after, {
    beforeLabel: `改前  ·  ${projection.before.overall}/100`,
    afterLabel: `改后  ·  ${projection.after.overall}/100`,
    ...targets,
    paneWidth: 860,
    maxHeight: 8000,
    deviceScaleFactor: 2,
  });
  const beforePng = await screenshotPage(page, { label: "改前", width: 900, maxHeight: 8000, deviceScaleFactor: 2 });
  const afterPng = await screenshotPage(after, { label: "改后", width: 900, maxHeight: 8000, deviceScaleFactor: 2 });
  const html = renderComparisonHtml(page, after, {
    width: 860,
    beforeLabel: `改前  ·  ${projection.before.overall}/100`,
    afterLabel: `改后  ·  ${projection.after.overall}/100`,
    ...targets,
  });

  await writeFile(`${OUT}/bayes_lecture_comparison.png`, comparison);
  await writeFile(`${OUT}/bayes_lecture_before.png`, beforePng);
  await writeFile(`${OUT}/bayes_lecture_after.png`, afterPng);
  await writeFile(`${OUT}/bayes_lecture_comparison.html`, html);
  console.log("wrote artifacts");
  await closeBrowser();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
