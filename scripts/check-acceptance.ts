/**
 * End-to-end check of the review tools against the built-in pages and a
 * lesson fixture. Does not call Notion. Run with `npx tsx scripts/check-acceptance.ts`.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { diffAfterBeautify } from "@/core/content-diff";
import { auditFormulas } from "@/core/formulas";
import { beautifyAllowed, getHandoff, setHandoff } from "@/core/handoff";
import { scanLayout } from "@/core/layout-scan";
import { applyOpsToPage, proposePlan } from "@/core/planner";
import { SAMPLE_META, SAMPLE_PAGES, getSample } from "@/core/samples";
import { auditStructure } from "@/core/structure-audit";
import type { PolishPage } from "@/core/types";

const failures: string[] = [];

function check(name: string, ok: boolean, detail?: string) {
  const mark = ok ? "PASS" : "FAIL";
  console.log(`${mark}  ${name}${detail ? `  ${detail}` : ""}`);
  if (!ok) failures.push(name);
}

const lesson: PolishPage = {
  id: "lesson",
  title: "链式法则",
  blocks: [
    { id: "h1", type: "heading_2", richText: [{ text: "定义 Definition" }] },
    { id: "h2", type: "heading_2", richText: [{ text: "Chain rule" }] },
    { id: "key", type: "paragraph", richText: [{ text: "考点：先拆外层，再乘内层导数。" }] },
    { id: "s1", type: "numbered_list_item", richText: [{ text: "1. 写出外层函数" }] },
    { id: "s3", type: "numbered_list_item", richText: [{ text: "3. 乘回内层导数" }] },
    { id: "wave", type: "paragraph", richText: [{ text: "显然，结果就是外层导数乘内层导数。" }] },
    { id: "bad", type: "equation", expression: "\\frac{1}{2" },
    { id: "ok", type: "equation", expression: "\\frac{d}{dx} f(g(x)) = f'(g(x)) g'(x)" },
    {
      id: "guide",
      type: "callout",
      richText: [
        {
          text: "使用说明：写作时必须先写中文再写英文，每段不少于三百字，并且要在段末重复一遍题目要求，否则视为未完成。这段说明不该留在正文里。",
        },
      ],
    },
    { id: "table", type: "unsupported", originalType: "table" },
  ],
  propertyFormulas: [{ name: "合计", expression: "prop(\"金额\") + (", valueUnsupported: false }],
};

console.log("\n== 初学者结构 / 公式 / 版式 ==");
const structure = auditStructure(lesson, { bilingual: true });
const formulas = auditFormulas(lesson);
const layout = scanLayout(lesson);
for (const finding of structure.findings) console.log(`  结构  ${finding.ruleId}  ${finding.message}`);
for (const finding of formulas.findings) console.log(`  公式  ${finding.where}  ${finding.problem}`);
for (const finding of layout.findings) console.log(`  版式  ${finding.ruleId}  ${finding.message}`);

const rules = new Set(structure.findings.map((finding) => finding.ruleId));
check("缺英文标题被指出", rules.has("bilingual-title"));
check("考点未进提示框被指出", rules.has("key-point-unmarked"));
check("从 1 跳到 3 被指出", rules.has("skipped-step"));
check("「显然」被指出", rules.has("skipped-derivation"));
check("坏公式被指出", formulas.findings.some((finding) => finding.locationId === "bad"));
check("好公式没有被误报", formulas.findings.every((finding) => finding.locationId !== "ok"));
check("数据库公式括号不配对被指出", formulas.findings.some((finding) => finding.locationId === "property:合计"));
check("长写作说明被指出", layout.findings.some((finding) => finding.ruleId === "instruction-callout"));
check("表格被指出", layout.findings.some((finding) => finding.ruleId === "table-overuse"));

console.log("\n== 美化样例：分数上升，且不改事实、不丢公式 ==");
for (const sample of SAMPLE_PAGES) {
  const themeId = SAMPLE_META.find((item) => item.id === sample.id)?.suggestedTheme;
  const withFormula: PolishPage = {
    ...sample,
    blocks: [...sample.blocks, { id: `${sample.id}-eq`, type: "equation", expression: "\\frac{1}{2}" }],
  };
  const plan = proposePlan(withFormula, { themeId });
  const after = applyOpsToPage(withFormula, plan.ops);
  const diff = diffAfterBeautify(withFormula, after);
  check(
    `${sample.title} 分数上升`,
    plan.audit.overall < 100,
    `${plan.audit.overall} → 美化后对照 clean=${diff.clean} 事实改动 ${diff.factChanges.length} 公式损坏 ${diff.formulaDamage.length}`,
  );
  check(`${sample.title} 没有改事实`, diff.factChanges.length === 0, diff.factChanges.map((item) => item.text).join(" | "));
  check(`${sample.title} 没有损坏公式`, diff.formulaDamage.length === 0);
}

console.log("\n== 故意改坏一段原文 ==");
const notes = getSample("sample-reading-notes");
if (!notes) throw new Error("missing sample");
const tampered: PolishPage = {
  ...notes,
  blocks: notes.blocks.map((block) =>
    block.id === "rn-2"
      ? { ...block, richText: [{ text: "锚定效应这一章完全不重要，实验数据是我编的。" }] }
      : block,
  ),
};
const tamperDiff = diffAfterBeautify(notes, tampered);
check("改掉原文会被 diff 抓住", tamperDiff.clean === false, `事实改动 ${tamperDiff.factChanges.length} 处`);

console.log("\n== 审阅门闩 ==");
async function checkGate() {
const dir = await mkdtemp(path.join(tmpdir(), "bloom-check-"));
const file = path.join(dir, "handoff.json");
const pageId = "lesson";
try {
  check("未审阅时不能写入", beautifyAllowed(null).allowed === false);
  let threw = false;
  try {
    await setHandoff(pageId, "beautifying", undefined, file);
  } catch {
    threw = true;
  }
  check("不能从未记录直接跳到美化中", threw);
  await setHandoff(pageId, "content_pass", "内容已看过", file);
  check("内容审通过后允许写入", beautifyAllowed((await getHandoff(pageId, file))?.state ?? null).allowed);
  await setHandoff(pageId, "beautifying", undefined, file);
  await setHandoff(pageId, "rereview_pass", undefined, file);
  check("复审通过后再次写入被拦住", beautifyAllowed((await getHandoff(pageId, file))?.state ?? null).allowed === false);
} finally {
  await rm(dir, { recursive: true, force: true });
}
}

async function main() {
  await checkGate();
  console.log(failures.length === 0 ? "\n全部通过" : `\n失败 ${failures.length} 项: ${failures.join(", ")}`);
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
