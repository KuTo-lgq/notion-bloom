/**
 * Dev harness: audit every sample page, project a plan, and write the
 * before/after comparison PNGs to disk. Run with `npm run demo`.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { audit, formatAuditSummary } from "@/core/audit";
import { opTargets } from "@/core/diff";
import { applyOpsToPage, projectPlan, proposePlan } from "@/core/planner";
import { SAMPLE_META, SAMPLE_PAGES } from "@/core/samples";
import { closeBrowser, screenshotComparison } from "@/renderer/screenshot";

const OUT = process.env.DEMO_OUT ?? "/tmp/notion-bloom-demo";

async function main() {
  await mkdir(OUT, { recursive: true });

  for (const page of SAMPLE_PAGES) {
    const meta = SAMPLE_META.find((m) => m.id === page.id);
    const themeId = meta?.suggestedTheme;

    const before = audit(page, themeId);
    const plan = proposePlan(page, { themeId });
    const projection = projectPlan(page, plan.ops, themeId);
    const after = applyOpsToPage(page, plan.ops);
    const targets = opTargets(plan.ops);

    console.log("\n" + "=".repeat(72));
    console.log(`${page.title}  [theme: ${themeId}]`);
    console.log("=".repeat(72));
    console.log(formatAuditSummary(before));
    console.log(`\n计划：${plan.ops.length} 个安全操作，${plan.withheld.length} 个破坏性操作被扣下，${plan.candidates.length} 个待 agent 决策`);
    console.log(`评分 ${projection.before.overall} → ${projection.after.overall}  (${projection.delta >= 0 ? "+" : ""}${projection.delta})`);
    console.log(`已解决规则: ${projection.resolvedRuleIds.join(", ") || "（无）"}`);
    console.log(`仍存在规则: ${projection.remainingRuleIds.join(", ") || "（无）"}`);
    console.log("\n--- diff ---");
    for (const line of plan.diff) console.log("  " + line);

    const png = await screenshotComparison(page, after, {
      beforeLabel: `BEFORE  ·  ${projection.before.overall}/100`,
      afterLabel: `AFTER  ·  ${projection.after.overall}/100  (+${projection.delta})`,
      ...targets,
    });
    const file = path.join(OUT, `${page.id}.png`);
    await writeFile(file, png);
    console.log(`\n截图: ${file}  (${Math.round(png.byteLength / 1024)} KB)`);
  }

  await closeBrowser();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
