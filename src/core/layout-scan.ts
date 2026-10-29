/**
 * Standing layout check.
 *
 * This is a read-only pass over how the page is built, separate from the
 * beautify plan. A page can be on-theme and still fail the standing rules:
 * a table where a heading and a list would do, a long "how to write this"
 * callout, or no cover and no icon.
 */

import { isHeading, plainText, visualLength, walk } from "./text";
import type { PolishPage } from "./types";

export type LayoutFinding = {
  ruleId: "table-overuse" | "instruction-callout" | "weak-hierarchy" | "missing-icon" | "missing-cover" | "dense-prose";
  severity: "high" | "medium" | "low";
  blockId?: string;
  message: string;
  repair: string;
};

const INSTRUCTION = /使用说明|写作要求|撰写要求|写作规范|书写要求|writing instructions|how to (?:use|write)/i;

export function scanLayout(page: PolishPage): { findings: LayoutFinding[] } {
  const findings: LayoutFinding[] = [];

  if (!page.icon) {
    findings.push({
      ruleId: "missing-icon",
      severity: "medium",
      message: "页面没有图标。在侧边栏里它只是一个默认文档图形。",
      repair: "选一个和标题对应的 emoji 图标。",
    });
  }
  if (!page.cover) {
    findings.push({
      ruleId: "missing-cover",
      severity: "low",
      message: "页面没有封面。打开时缺少一个视觉起点。",
      repair: "用一张 Notion 自带封面，不要另找素材。",
    });
  }

  let tables = 0;
  let run = 0;
  let sawHeading = false;
  const flushRun = () => {
    if (run >= 4) {
      findings.push({
        ruleId: "dense-prose",
        severity: "medium",
        message: `有 ${run} 段文字连续排在一起，中间没有标题、列表或提示框。`,
        repair: "用标题把这一段切开，或者把并列项改成列表。留白来自分块，不是来自空行。",
      });
    }
    run = 0;
  };

  for (const { block } of walk(page.blocks)) {
    if (block.originalType === "table") tables += 1;

    if (isHeading(block)) sawHeading = true;

    if (block.type === "paragraph" && plainText(block.richText).trim()) run += 1;
    else if (block.type !== "paragraph") flushRun();

    if (block.type === "callout") {
      const text = plainText(block.richText);
      if (INSTRUCTION.test(text) && visualLength(text) > 100) {
        findings.push({
          ruleId: "instruction-callout",
          severity: "high",
          blockId: block.id,
          message: "有一条很长的「使用说明 / 写作要求」提示框。它会压过正文。",
          repair: "删掉或挪走这条说明。页面上只留文档本身的层级，不留写作说明书。",
        });
      }
    }
  }
  flushRun();

  if (tables > 0) {
    findings.push({
      ruleId: "table-overuse",
      severity: tables > 1 ? "high" : "medium",
      message: `页面里有 ${tables} 个表格。站立式版式以标题和列表为主，表格很难在窄栏里读。`,
      repair: "能改成「标题 + 列表」的表格就改掉。必须对账、必须对齐数字的表格可以留一张。",
    });
  }

  const volume = walk(page.blocks).reduce((sum, entry) => sum + visualLength(plainText(entry.block.richText)), 0);
  if (!sawHeading && volume > 400) {
    findings.push({
      ruleId: "weak-hierarchy",
      severity: "high",
      message: "这一页几乎没有标题，层级立不起来。",
      repair: "按读者要完成的步骤加上二级标题。标题是导航，不是装饰。",
    });
  }

  return { findings };
}
