import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { diffAfterBeautify } from "@/core/content-diff";
import { auditFormulas } from "@/core/formulas";
import { beautifyAllowed, setHandoff } from "@/core/handoff";
import { scanLayout } from "@/core/layout-scan";
import { auditStructure } from "@/core/structure-audit";
import type { PolishPage } from "@/core/types";

const page = (partial: Partial<PolishPage> & Pick<PolishPage, "blocks">): PolishPage => ({
  id: "p",
  title: "标题 Title",
  ...partial,
});

test("audit_formulas lists a broken equation and an empty one, and accepts a valid one", () => {
  const result = auditFormulas(
    page({
      blocks: [
        { id: "ok", type: "equation", expression: "\\frac{1}{2}" },
        { id: "bad", type: "equation", expression: "\\frac{1}{2" },
        { id: "empty", type: "equation", expression: "  " },
        {
          id: "inline",
          type: "paragraph",
          richText: [{ text: "E=mc^2", equation: "E=mc^2" }, { text: "然后" }],
        },
      ],
      propertyFormulas: [{ name: "合计", expression: "prop(\"金额\") + (", valueUnsupported: false }],
    }),
  );
  const ids = result.findings.map((finding) => finding.locationId);
  assert.ok(ids.includes("bad"));
  assert.ok(ids.includes("empty"));
  assert.ok(ids.includes("property:合计"));
  assert.equal(ids.includes("ok"), false);
  assert.equal(ids.includes("inline"), false);
  assert.equal(result.checked, 5);
});

test("audit_structure flags a one-language heading, an unmarked exam point, a skipped step, and a handwave", () => {
  const result = auditStructure(
    page({
      title: "只是中文",
      blocks: [
        { id: "h", type: "heading_2", richText: [{ text: "导数 Derivative" }] },
        { id: "h2", type: "heading_2", richText: [{ text: "Chain rule" }] },
        { id: "k", type: "paragraph", richText: [{ text: "考点：链式法则要会拆。" }] },
        { id: "s1", type: "numbered_list_item", richText: [{ text: "1. 写出外层" }] },
        { id: "s3", type: "numbered_list_item", richText: [{ text: "3. 乘回去" }] },
        { id: "w", type: "paragraph", richText: [{ text: "显然，导数就是外层乘内层。" }] },
      ],
    }),
    { bilingual: true },
  );
  const rules = result.findings.map((finding) => finding.ruleId);
  assert.ok(rules.includes("bilingual-title"));
  assert.ok(rules.includes("key-point-unmarked"));
  assert.ok(rules.includes("skipped-step"));
  assert.ok(rules.includes("skipped-derivation"));
  const skip = result.findings.find((finding) => finding.ruleId === "skipped-step");
  assert.match(skip?.repair ?? "", /第 2 步/);
});

test("scan_layout_rules rejects a long writing-instruction callout and a table", () => {
  const result = scanLayout(
    page({
      icon: { type: "emoji", emoji: "📄" },
      cover: "https://example.com/c.png",
      blocks: [
        {
          id: "c",
          type: "callout",
          richText: [
            {
              text: "使用说明：写作时必须先写中文再写英文，每段不少于三百字，并且要在段末重复一遍题目要求，否则视为未完成。这里是故意写长的说明，它不该留在正文页上。",
            },
          ],
        },
        { id: "t", type: "unsupported", originalType: "table" },
      ],
    }),
  );
  const rules = result.findings.map((finding) => finding.ruleId);
  assert.ok(rules.includes("instruction-callout"));
  assert.ok(rules.includes("table-overuse"));
  assert.equal(rules.includes("missing-icon"), false);
});

test("diff_after_beautify ignores a split and a copied heading, and catches a changed fact and a lost formula", () => {
  const before = page({
    blocks: [
      { id: "a", type: "paragraph", richText: [{ text: "注册率从 12.4% 升到 14.1%。下一步看留存。" }] },
      { id: "e", type: "equation", expression: "\\frac{1}{2}" },
    ],
  });
  const splitOnly = page({
    blocks: [
      { id: "a1", type: "paragraph", richText: [{ text: "注册率从 12.4% 升到 14.1%。" }] },
      { id: "a2", type: "paragraph", richText: [{ text: "下一步看留存。" }] },
      { id: "h", type: "heading_2", richText: [{ text: "注册率" }] },
      { id: "e", type: "equation", expression: "\\frac{1}{2}" },
    ],
  });
  assert.equal(diffAfterBeautify(before, splitOnly).clean, true);

  const changed = page({
    blocks: [
      { id: "a", type: "paragraph", richText: [{ text: "注册率从 12.4% 升到 18%。下一步看留存。" }] },
      { id: "e", type: "equation", expression: "\\frac{1}{2" },
    ],
  });
  const diff = diffAfterBeautify(before, changed);
  assert.equal(diff.clean, false);
  assert.ok(diff.factChanges.some((change) => change.kind === "removed" || change.kind === "inserted"));
  assert.ok(diff.formulaDamage.some((damage) => damage.kind === "removed" || damage.kind === "now_invalid"));
});

test("handoff_status refuses beautify before content review and refuses a backwards jump", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "bloom-handoff-"));
  const file = path.join(dir, "handoff.json");
  try {
    assert.equal(beautifyAllowed(null).allowed, false);
    await assert.rejects(() => setHandoff("page-1", "beautifying", undefined, file));
    await setHandoff("page-1", "content_pass", undefined, file);
    assert.equal(beautifyAllowed("content_pass").allowed, true);
    await setHandoff("page-1", "beautifying", undefined, file);
    await setHandoff("page-1", "rereview_pass", undefined, file);
    assert.equal(beautifyAllowed("rereview_pass").allowed, false);
    await assert.rejects(() => setHandoff("page-1", "beautifying", undefined, file));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
