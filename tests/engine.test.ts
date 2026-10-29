import assert from "node:assert/strict";
import { test } from "node:test";

import { audit } from "@/core/audit";
import { applyOpsToPage, projectPlan, proposePlan } from "@/core/planner";
import { getSample } from "@/core/samples";
import { getTheme } from "@/core/themes";
import { flatten, topicHeading } from "@/core/text";
import { toRichText } from "@/notion/map";
import type { PolishPage } from "@/core/types";

const payment = getSample("sample-payment-spec")!;
const notes = getSample("sample-reading-notes")!;
const report = getSample("sample-weekly-report")!;

test("a plan raises the score on every sample", () => {
  for (const [page, themeId] of [
    [payment, "clean-docs"],
    [notes, "warm-notes"],
    [report, "focus-brief"],
  ] as const) {
    const plan = proposePlan(page, { themeId });
    const projection = projectPlan(page, plan.ops, themeId);
    assert.ok(projection.delta > 0, `${page.title} did not improve`);
    assert.ok(projection.after.overall >= projection.before.overall);
  }
});

test("planning is idempotent: a second pass adds no table of contents and no duplicate dividers", () => {
  const plan = proposePlan(payment, { themeId: "clean-docs" });
  const once = applyOpsToPage(payment, plan.ops);
  const again = proposePlan(once, { themeId: "clean-docs" });

  const tocInserts = again.ops.filter(
    (op) => op.kind === "insert_block" && op.block.type === "table_of_contents",
  );
  assert.equal(tocInserts.length, 0);

  const dividerCount = (page: PolishPage) =>
    flatten(page.blocks).filter((block) => block.type === "divider").length;
  const twice = applyOpsToPage(once, again.ops);
  assert.equal(dividerCount(twice), dividerCount(once));
});

test("callout icon and background come out of the same semantic", () => {
  const theme = getTheme("clean-docs");
  const plan = proposePlan(payment, { themeId: theme.id });
  const after = applyOpsToPage(payment, plan.ops);
  const byEmoji = new Map(Object.values(theme.callouts).map((style) => [style.emoji, style.color]));

  for (const block of flatten(after.blocks)) {
    if (block.type !== "callout" || block.icon?.type !== "emoji") continue;
    assert.equal(block.color, byEmoji.get(block.icon.emoji), block.id);
  }
});

test("destructive edits are withheld unless asked for", () => {
  const held = proposePlan(payment, { themeId: "clean-docs" });
  assert.ok(held.ops.every((op) => !op.destructive));
  assert.ok(held.withheld.some((op) => op.destructive));

  const allowed = proposePlan(payment, { themeId: "clean-docs", includeDestructive: true });
  assert.ok(allowed.ops.some((op) => op.destructive));
  assert.equal(allowed.withheld.length, 0);
});

test("recreating blocks can be turned off, and the plan says so", () => {
  const plan = proposePlan(payment, { themeId: "clean-docs", allowRecreate: false });
  assert.ok(plan.ops.every((op) => !op.recreates));
  assert.ok(plan.withheld.some((op) => op.recreates));
  assert.ok(plan.warnings.some((warning) => warning.includes("includeDestructive") || warning.length > 0));
});

test("a heading skip is repaired to the missing level, including heading 4", () => {
  const page: PolishPage = {
    id: "skip",
    title: "跳级",
    icon: { type: "emoji", emoji: "📄" },
    cover: "https://example.com/c.png",
    blocks: [
      { id: "h2", type: "heading_2", richText: [{ text: "章节" }] },
      { id: "h4", type: "heading_4", richText: [{ text: "跳过了三级" }] },
    ],
  };
  const plan = proposePlan(page, { themeId: "clean-docs" });
  const fix = plan.ops.find((op) => op.kind === "convert_block" && op.blockId === "h4");
  assert.ok(fix && fix.kind === "convert_block");
  assert.equal(fix.to, "heading_3");
});

test("an empty page audits without throwing and is flagged for identity", () => {
  const page: PolishPage = { id: "empty", title: "空页面", blocks: [] };
  const result = audit(page, "clean-docs");
  assert.ok(result.findings.some((finding) => finding.ruleId === "page-icon-missing"));
  assert.ok(result.overall >= 0 && result.overall <= 100);
});

test("rich text is split under Notion's 2000 character limit", () => {
  const items = toRichText([{ text: "字".repeat(4500), bold: true }]);
  assert.ok(items.length >= 3);
  assert.ok(items.every((item) => item.type === "text" && item.text.content.length <= 2000));
  assert.ok(items.every((item) => item.annotations?.bold));
});

test("a headingless reading log grows real section titles, once", () => {
  assert.equal(topicHeading("锚定效应这一章最让我意外。实验里……"), "锚定效应");
  assert.equal(topicHeading("可得性启发讲的是我们用想起来容易不容易代替概率。"), "可得性启发");
  assert.equal(topicHeading("读完最大的收获不是记住了一堆偏误名称，而是接受了一个前提。"), null);

  const plan = proposePlan(notes, { themeId: "warm-notes" });
  const once = applyOpsToPage(notes, plan.ops);
  const titles = flatten(once.blocks)
    .filter((block) => block.type === "heading_2")
    .map((block) => block.richText?.map((run) => run.text).join(""));
  for (const title of ["锚定效应", "可得性启发", "前景理论", "峰终定律"]) {
    assert.ok(titles.includes(title), `missing ${title}`);
  }

  const again = applyOpsToPage(once, proposePlan(once, { themeId: "warm-notes" }).ops);
  const titlesAgain = flatten(again.blocks).filter((block) => block.type === "heading_2");
  assert.equal(titlesAgain.length, titles.length);
});

test("short sibling labels become one row of columns, and only once", () => {
  const page: PolishPage = {
    id: "stats",
    title: "本周指标",
    icon: { type: "emoji", emoji: "📊" },
    cover: "https://example.com/c.png",
    blocks: [
      { id: "h", type: "heading_2", richText: [{ text: "本周" }] },
      { id: "a", type: "paragraph", richText: [{ text: "注册 14.1%" }] },
      { id: "b", type: "paragraph", richText: [{ text: "邀请 0.3 人" }] },
      { id: "c", type: "paragraph", richText: [{ text: "留存 20%" }] },
    ],
  };
  const after = applyOpsToPage(page, proposePlan(page, { themeId: "focus-brief" }).ops);
  const columns = flatten(after.blocks).filter((block) => block.type === "column_list");
  assert.equal(columns.length, 1);
  assert.equal(columns[0].children?.length, 3);
  const twice = applyOpsToPage(after, proposePlan(after, { themeId: "focus-brief" }).ops);
  assert.equal(flatten(twice.blocks).filter((block) => block.type === "column_list").length, 1);
});

test("a reading log with no headings is not scored as a success", () => {
  const result = audit(notes, "warm-notes");
  assert.ok(result.overall < 80, `expected a mid score, got ${result.overall}`);
  assert.ok(result.findings.some((finding) => finding.ruleId === "long-page-without-headings"));
});
