/**
 * Formula audit.
 *
 * Two different languages show up on a Notion page. Display math (equation
 * blocks and inline equations) is KaTeX. Database formula properties are
 * Notion's own formula language, and the only authoritative failure signal
 * the API gives us is a computed value of type `unsupported`. Everything else
 * we can check locally: empty expressions, unmatched brackets, and KaTeX
 * parse errors.
 */

import katex from "katex";

import { flatten, walk } from "./text";
import type { PolishBlock, PolishPage, PropertyFormula } from "./types";

export type FormulaKind = "equation_block" | "inline_equation" | "database_formula";

export type FormulaFinding = {
  kind: FormulaKind;
  /** Block id, or `property:<name>` for a database formula. */
  locationId: string;
  /** Where a person would look: a heading breadcrumb, or the property name. */
  where: string;
  expression: string;
  problem: string;
};

export type FormulaAudit = {
  checked: number;
  findings: FormulaFinding[];
};

function breadcrumb(blocks: PolishBlock[], blockId: string): string {
  const chain: string[] = [];
  const visit = (list: PolishBlock[], trail: string[]): boolean => {
    for (const block of list) {
      const label =
        block.type.startsWith("heading") && block.richText
          ? block.richText.map((run) => run.text).join("").trim()
          : "";
      const nextTrail = label ? [...trail, label] : trail;
      if (block.id === blockId) {
        chain.push(...(nextTrail.length > 0 ? nextTrail : trail));
        return true;
      }
      if (block.children && visit(block.children, nextTrail)) return true;
    }
    return false;
  };
  visit(blocks, []);
  return chain.join(" / ") || "页面正文";
}

/** Notion formula expressions are not KaTeX. Bracket balance is the local check. */
export function checkNotionFormula(expression: string): string | null {
  if (!expression.trim()) return "公式表达式是空的";
  const stripped = expression.replace(/"(?:\\.|[^"\\])*"/g, "\"\"");
  let round = 0;
  let square = 0;
  for (const ch of stripped) {
    if (ch === "(") round += 1;
    else if (ch === ")") round -= 1;
    else if (ch === "[") square += 1;
    else if (ch === "]") square -= 1;
    if (round < 0 || square < 0) return "括号不配对";
  }
  if (round !== 0 || square !== 0) return "括号不配对";
  return null;
}

/**
 * A subscript or escaped caret left in ordinary text.
 * `zero_grad` stays: the underscore sits inside an identifier, not after a single symbol.
 */
export const LEAKED_ESCAPE = /\\[_^&]|(?<![A-Za-z0-9])[A-Za-zβθλαγδε]_\{?[A-Za-z0-9]|[A-Za-z]\^[0-9{]/;

/** Zhang et al. require β₁ < √β₂. β₁ < β₂ is a different, weaker claim. */
export function wrongBetaOrder(text: string): boolean {
  const masked = text
    .replace(/β\s*[₁1]\s*<\s*√\s*β\s*[₂2]/g, "")
    .replace(/\\beta_\{?1\}?\s*<\s*\\sqrt\s*\{?\s*\\beta_\{?2\}?/g, "")
    .replace(/beta_1\s*<\s*sqrt\(\s*beta_2\s*\)/gi, "");
  return (
    /β\s*[₁1]\s*<\s*β\s*[₂2]/.test(masked) ||
    /\\beta_\{?1\}?\s*<\s*\\beta_\{?2\}?/.test(masked) ||
    /beta_1\s*<\s*beta_2/i.test(masked)
  );
}

export function statesSqrtBetaOrder(text: string): boolean {
  return (
    /β\s*[₁1]\s*<\s*√\s*β\s*[₂2]/.test(text) ||
    /\\beta_\{?1\}?\s*<\s*\\sqrt\s*\{?\s*\\beta_\{?2\}?/.test(text) ||
    /beta_1\s*<\s*sqrt\(\s*beta_2\s*\)/i.test(text)
  );
}

export function checkKatex(expression: string): string | null {
  if (!expression.trim()) return "公式是空的";
  try {
    katex.renderToString(expression, { throwOnError: true, displayMode: true });
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return message.replace(/^KaTeX parse error:\s*/i, "").split("\n")[0] ?? "无法解析";
  }
}

export function auditFormulas(page: PolishPage): FormulaAudit {
  const findings: FormulaFinding[] = [];
  let checked = 0;

  for (const { block } of walk(page.blocks)) {
    if (block.type === "equation") {
      checked += 1;
      const expression = block.expression ?? "";
      const problem = checkKatex(expression) ?? (wrongBetaOrder(expression) ? "条件写成了 β₁ < β₂。Zhang 等人写的是 β₁ < √β₂。" : null);
      if (problem) {
        findings.push({
          kind: "equation_block",
          locationId: block.id,
          where: breadcrumb(page.blocks, block.id),
          expression,
          problem,
        });
      }
    }
    for (const [index, run] of (block.richText ?? []).entries()) {
      if (run.equation === undefined) continue;
      checked += 1;
      const problem = checkKatex(run.equation) ?? (wrongBetaOrder(run.equation) ? "条件写成了 β₁ < β₂。Zhang 等人写的是 β₁ < √β₂。" : null);
      if (problem) {
        findings.push({
          kind: "inline_equation",
          locationId: block.id,
          where: `${breadcrumb(page.blocks, block.id)} · 行内公式 #${index + 1}`,
          expression: run.equation,
          problem,
        });
      }
    }
  }

  for (const property of page.propertyFormulas ?? []) {
    checked += 1;
    const syntax = property.expression ? checkNotionFormula(property.expression) : null;
    const problem = property.valueUnsupported
      ? "Notion 把这个公式的计算结果标为 unsupported。公式多半已损坏，或当前接口无法求值。"
      : syntax;
    if (!problem) continue;
    findings.push({
      kind: "database_formula",
      locationId: `property:${property.name}`,
      where: `属性「${property.name}」`,
      expression: property.expression,
      problem,
    });
  }

  return { checked, findings };
}

export function formulaExpressions(page: PolishPage): string[] {
  const out: string[] = [];
  for (const block of flatten(page.blocks)) {
    if (block.type === "equation") out.push(block.expression ?? "");
    for (const run of block.richText ?? []) {
      if (run.equation !== undefined) out.push(run.equation);
    }
  }
  for (const property of page.propertyFormulas ?? []) out.push(property.expression);
  return out;
}

export type { PropertyFormula };
