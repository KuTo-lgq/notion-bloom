/**
 * Structure audit for pages a beginner has to follow.
 *
 * Rule-driven on purpose. The tool does not decide whether a derivation is
 * elegant. It flags the concrete gaps a beginner trips on: a heading in only
 * one language, a key point left as ordinary text, a numbered list that skips
 * a step, and the phrases authors use when they skip a derivation.
 */

import { LEAKED_ESCAPE, wrongBetaOrder } from "./formulas";
import { flatten, isHeading, plainText, walk } from "./text";
import type { PolishBlock, PolishPage } from "./types";

export type StructureFinding = {
  ruleId:
    | "bilingual-title"
    | "key-point-unmarked"
    | "skipped-step"
    | "skipped-derivation"
    | "double-number"
    | "leaked-escape"
    | "missing-ppt-citation"
    | "missing-self-test"
    | "thin-self-test"
    | "thin-research"
    | "missing-optimizer-comparison"
    | "fragmented-outline"
    | "wrong-claim";
  blockId?: string;
  excerpt: string;
  message: string;
  /** What to add so a beginner can follow without guessing. */
  repair: string;
};

const CJK = /[\u3400-\u9fff]/;
const LATIN = /[A-Za-z]/;
const KEY_POINT = /重点|考点|考點|key\s*points?|exam\s*points?|takeaways?/i;
const EMOJI = /^(?:\p{Extended_Pictographic}|[\u2600-\u27BF])/u;
const HANDWAVE = /显然|不難看出|不难看出|容易得到|同理可得|略去|证明略|此处略|it is obvious|clearly,|trivial|left to the reader|w\.?\s*l\.?\s*o\.?\s*g\.?/i;

function excerpt(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > 48 ? `${trimmed.slice(0, 48)}…` : trimmed;
}

function scriptOf(text: string): "both" | "zh" | "en" | "other" {
  const zh = CJK.test(text);
  const en = LATIN.test(text);
  if (zh && en) return "both";
  if (zh) return "zh";
  if (en) return "en";
  return "other";
}

function bilingual(text: string, where: string, blockId?: string): StructureFinding | null {
  const kind = scriptOf(text);
  if (kind === "both" || kind === "other") return null;
  const missing = kind === "zh" ? "英文" : "中文";
  return {
    ruleId: "bilingual-title",
    blockId,
    excerpt: excerpt(text),
    message: `${where}「${excerpt(text)}」只有${kind === "zh" ? "中文" : "英文"}。`,
    repair: `只有在用户要求双语时，才在同一行补上${missing}，例如「中文标题 / English Title」。`,
  };
}

function leadingNumber(text: string): number | null {
  const match = text.trim().match(/^(?:第\s*)?(\d{1,2})(?:\s*[.、)）]|步)/);
  if (!match) return null;
  return Number(match[1]);
}

export function auditStructure(page: PolishPage, options?: { bilingual?: boolean }): { findings: StructureFinding[] } {
  const findings: StructureFinding[] = [];
  const pairLanguages = options?.bilingual === true;

  if (pairLanguages) {
    const titleGap = bilingual(page.title, "页面标题");
    if (titleGap) findings.push(titleGap);
  }

  for (const { block, siblings, index } of walk(page.blocks)) {
    const text = plainText(block.richText);

    if (pairLanguages && isHeading(block)) {
      const gap = bilingual(text, "标题", block.id);
      if (gap) findings.push(gap);
    }

    if (KEY_POINT.test(text) && block.type !== "callout" && !EMOJI.test(text.trim())) {
      findings.push({
        ruleId: "key-point-unmarked",
        blockId: block.id,
        excerpt: excerpt(text),
        message: `「${excerpt(text)}」在说重点或考点，但没有放进提示框，开头也没有小图标。`,
        repair: "收成带图标的提示框（考点用 🎯，重点用 📌）。图标是扫读时的标记，不是装饰。",
      });
    }

    const prose = (block.richText ?? [])
      .filter((run) => run.equation === undefined)
      .map((run) => run.text)
      .join("");
    if (block.type !== "equation" && block.type !== "code" && LEAKED_ESCAPE.test(prose)) {
      findings.push({
        ruleId: "leaked-escape",
        blockId: block.id,
        excerpt: excerpt(prose),
        message: "正文里有 \\_、\\^ 或 w_0 这种下标，没有放进公式。",
        repair: "把带下标或上标的式子放进公式。不要在普通文字里写 X\\_i 或 w_0。",
      });
    }

    if (block.type === "numbered_list_item" && /^\s*\d+\s*[.、．]/.test(text)) {
      findings.push({
        ruleId: "double-number",
        blockId: block.id,
        excerpt: excerpt(text),
        message: "编号列表里又写了序号，页面上会变成「1. 1.」。",
        repair: "删掉文字开头的「1.」，只保留这一步的内容。列表自己会编号。",
      });
    }

    if (block.type === "numbered_list_item") {
      const current = leadingNumber(text);
      const previousItem = [...siblings.slice(0, index)].reverse().find((item) => item.type === "numbered_list_item");
      const previous = previousItem ? leadingNumber(plainText(previousItem.richText)) : null;
      if (current !== null && previous !== null && current > previous + 1) {
        const missing = Array.from({ length: current - previous - 1 }, (_, i) => previous + 1 + i);
        findings.push({
          ruleId: "skipped-step",
          blockId: block.id,
          excerpt: excerpt(text),
          message: `步骤从 ${previous} 跳到 ${current}，中间没有第 ${missing.join("、")} 步。`,
          repair: `补上第 ${missing.join("、")} 步的具体操作或等式。初学者不能从编号本身推出被跳过的那一步。`,
        });
      }
    }

    if ((block.type === "paragraph" || block.type === "callout" || block.type === "quote") && HANDWAVE.test(text)) {
      findings.push({
        ruleId: "skipped-derivation",
        blockId: block.id,
        excerpt: excerpt(text),
        message: `「${excerpt(text)}」用跳步用语带过了推导。`,
        repair: "写下从上一个式子到这个结论之间的那一行。不要用「显然」「同理」「略」代替这一步。",
      });
    }
  }

  const all = flatten(page.blocks)
    .map((block) => [plainText(block.richText), block.expression ?? ""].join("\n"))
    .join("\n");
  const long = all.length > 8000 || page.blocks.filter(isHeading).length > 12;
  const h1 = page.blocks.filter((block) => block.type === "heading_1").length;
  if (long && !/PPT\s*第|第\s*\d+\s*页|\d+\s*\/\s*\d+/.test(all)) {
    findings.push({
      ruleId: "missing-ppt-citation",
      excerpt: excerpt(page.title),
      message: "这一长讲没有课件页码。大节要写「PPT 第 n 页」。",
      repair: "每个大节标题或首段写上对应的幻灯片页码。",
    });
  }
  if (long && !/自测|考试要点|Exam Tips|检查题/.test(all)) {
    findings.push({
      ruleId: "missing-self-test",
      excerpt: excerpt(page.title),
      message: "这一长讲没有自测或考试要点。",
      repair: "在末尾加一组检查题，题目用课件里已经出现的数。",
    });
  }
  const practice = [...all.matchAll(/\bQ\s*(\d+)([\s\S]*?)(?=\bQ\s*\d+|$)/g)];
  const solid = practice.filter((match) => /答案|Answer/.test(match[2] ?? "") && (match[2]?.length ?? 0) >= 40);
  const examBullets = flatten(page.blocks)
    .filter((block) => block.type === "callout" && /考试要点|Exam Tips/.test(plainText(block.richText)))
    .reduce((n, block) => n + plainText(block.richText).split("\n").filter((line) => /^\s*\d{1,2}\s*[.、．]/.test(line)).length, 0);
  if (long && (solid.length < 5 || examBullets < 5)) {
    findings.push({
      ruleId: "thin-self-test",
      excerpt: excerpt(page.title),
      message: "自测不到 5 道有过程的题，或考试要点不足 5 条。",
      repair: "每题写出过程再给答案。考试要点单独成框，每条一行，用「1.」开头。",
    });
  }
  const years = ["2015", "2018", "2021", "2022"].filter((year) => all.includes(year));
  if (long && /Adam/i.test(all) && /Kingma|AMSGrad|Reddi/.test(all) && years.length < 3) {
    findings.push({
      ruleId: "thin-research",
      excerpt: excerpt(page.title),
      message: "Adam 的研究故事没有按论文和年份展开。",
      repair: "至少写三篇、三个年份，说明每篇解决了什么、没解决什么。",
    });
  }
  if (long && h1 > 14) {
    findings.push({
      ruleId: "fragmented-outline",
      excerpt: excerpt(page.title),
      message: `一级标题有 ${h1} 个，大纲被拆得太碎。`,
      repair: "大章用一级标题，小节用二级标题。语言跟用户的要求走。",
    });
  }
  if (wrongBetaOrder(all)) {
    findings.push({
      ruleId: "wrong-claim",
      excerpt: "β₁ < β₂",
      message: "研究条件写成了 β₁ < β₂。",
      repair: "改成 Zhang 等人的 β₁ < √β₂。",
    });
  }
  const optimizers = ["SGD", "动量", "Momentum", "Nesterov", "AdaGrad", "RMSProp", "Adam"].filter((name) => new RegExp(name, "i").test(all));
  const hasTable = flatten(page.blocks).some((block) => block.originalType === "table" || block.originalType === "table_row");
  if (long && optimizers.length >= 4 && (!/比较|对照/.test(all) || !hasTable)) {
    findings.push({
      ruleId: "missing-optimizer-comparison",
      excerpt: optimizers.slice(0, 4).join("、"),
      message: "讲了多种优化器，但没有一张对照表。",
      repair: "加一张六种算法总表：各自记住什么、更新式是什么、局限是什么。散文点名不算。",
    });
  }

  return { findings };
}
