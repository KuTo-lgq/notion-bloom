/**
 * After-beautify diff.
 *
 * Beautify is allowed to split paragraphs, add headings that repeat a phrase
 * already on the page, and change colours. It is not allowed to change a fact
 * or lose a formula. This compares the text a reader would read, not the block
 * ids, because a type conversion replaces the id while keeping the words.
 */

import { auditFormulas, checkKatex, formulaExpressions } from "./formulas";
import { flatten, plainText } from "./text";
import type { PolishBlock, PolishPage } from "./types";

export type FactChange = {
  kind: "removed" | "inserted";
  text: string;
};

export type FormulaDamage = {
  kind: "removed" | "changed" | "now_invalid";
  expression: string;
  problem?: string;
};

export type BeautifyDiff = {
  /** True when no fact text was lost or invented and no formula was damaged. */
  clean: boolean;
  factChanges: FactChange[];
  formulaDamage: FormulaDamage[];
};

function contentBlocks(page: PolishPage): PolishBlock[] {
  return flatten(page.blocks).filter((block) => {
    if (block.type === "equation" || block.type === "divider" || block.type === "table_of_contents") return false;
    return plainText(block.richText).trim().length > 0;
  });
}

function normalize(text: string): string {
  return text.replace(/\s+/g, "").trim();
}

/** Pieces of reader-visible text, in order, with whitespace removed. */
function segments(page: PolishPage): string[] {
  return contentBlocks(page)
    .map((block) => normalize(plainText(block.richText)))
    .filter((text) => text.length > 0);
}

/**
 * A segment counts as preserved when it still occurs as a contiguous substring
 * of the whole after-document, or it was only split across later segments.
 */
function documentText(parts: string[]): string {
  return parts.join("");
}

export function diffAfterBeautify(before: PolishPage, after: PolishPage): BeautifyDiff {
  const beforeParts = segments(before);
  const afterParts = segments(after);
  const beforeDoc = documentText(beforeParts);
  const afterDoc = documentText(afterParts);
  const factChanges: FactChange[] = [];

  for (const part of beforeParts) {
    if (!afterDoc.includes(part)) factChanges.push({ kind: "removed", text: part.slice(0, 80) });
  }
  for (const part of afterParts) {
    // A new heading that copies a phrase already on the page is not a new fact.
    if (beforeDoc.includes(part)) continue;
    factChanges.push({ kind: "inserted", text: part.slice(0, 80) });
  }

  const formulaDamage: FormulaDamage[] = [];
  const beforeFormulas = formulaExpressions(before);
  const afterFormulas = formulaExpressions(after);
  const afterCounts = new Map<string, number>();
  for (const expression of afterFormulas) afterCounts.set(expression, (afterCounts.get(expression) ?? 0) + 1);
  for (const expression of beforeFormulas) {
    const left = afterCounts.get(expression) ?? 0;
    if (left > 0) afterCounts.set(expression, left - 1);
    else formulaDamage.push({ kind: "removed", expression });
  }
  for (const expression of afterFormulas) {
    const problem = expression.includes("prop(") ? null : checkKatex(expression);
    const wasValid = beforeFormulas.includes(expression) && (expression.includes("prop(") || checkKatex(expression) === null);
    if (problem && wasValid) formulaDamage.push({ kind: "now_invalid", expression, problem });
  }

  // Property formulas that became unsupported.
  const beforeProps = new Map((before.propertyFormulas ?? []).map((item) => [item.name, item]));
  for (const item of after.propertyFormulas ?? []) {
    const previous = beforeProps.get(item.name);
    if (previous && !previous.valueUnsupported && item.valueUnsupported) {
      formulaDamage.push({ kind: "changed", expression: item.expression || item.name, problem: "计算结果变为 unsupported" });
    }
    if (previous && previous.expression && item.expression && previous.expression !== item.expression) {
      formulaDamage.push({ kind: "changed", expression: item.expression, problem: `原表达式是 ${previous.expression}` });
    }
  }

  // Surface currently invalid formulas that the before page did not have as invalid.
  const beforeInvalid = new Set(auditFormulas(before).findings.map((finding) => finding.expression));
  for (const finding of auditFormulas(after).findings) {
    if (beforeInvalid.has(finding.expression)) continue;
    if (formulaDamage.some((item) => item.expression === finding.expression)) continue;
    formulaDamage.push({ kind: "now_invalid", expression: finding.expression, problem: finding.problem });
  }

  return {
    clean: factChanges.length === 0 && formulaDamage.length === 0,
    factChanges,
    formulaDamage,
  };
}
