/**
 * Scoring.
 *
 * The score exists so an agent has a measurable target. Without one it cannot
 * tell whether its last edit helped. The absolute number matters less than the
 * fact that applying a plan moves it in the right direction — which is why
 * `estimateScoreAfter` replays a plan against the same rules rather than
 * inventing a separate heuristic.
 */

import { runRules, type Finding } from "./rules";
import { DIMENSION_WEIGHTS, getTheme } from "./themes";
import {
  DIMENSION_LABELS,
  SCORE_DIMENSIONS,
  SEVERITY_WEIGHT,
  type PolishPage,
  type ScoreDimension,
} from "./types";

/**
 * One rule firing many times should not zero out a whole dimension — twelve
 * off-palette blocks is one mistake repeated, not twelve separate mistakes.
 */
const MAX_DEDUCTION_PER_RULE = 45;

export type DimensionScore = {
  dimension: ScoreDimension;
  label: string;
  blurb: string;
  score: number;
  findingCount: number;
};

export type AuditResult = {
  themeId: string;
  themeName: string;
  overall: number;
  grade: "A" | "B" | "C" | "D" | "E";
  dimensions: DimensionScore[];
  findings: Finding[];
  /** Counts by severity, for a one-line summary. */
  summary: { high: number; medium: number; low: number; autoFixable: number };
};

function gradeFor(score: number): AuditResult["grade"] {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "E";
}

function scoreDimensions(findings: Finding[]): DimensionScore[] {
  return SCORE_DIMENSIONS.map((dimension) => {
    const own = findings.filter((f) => f.dimension === dimension);
    const byRule = new Map<string, Finding[]>();
    for (const finding of own) {
      byRule.set(finding.ruleId, [...(byRule.get(finding.ruleId) ?? []), finding]);
    }
    let deduction = 0;
    for (const group of byRule.values()) {
      const raw = group.reduce((sum, f) => sum + SEVERITY_WEIGHT[f.severity], 0);
      deduction += Math.min(raw, MAX_DEDUCTION_PER_RULE);
    }
    return {
      dimension,
      label: DIMENSION_LABELS[dimension].zh,
      blurb: DIMENSION_LABELS[dimension].blurb,
      score: Math.max(0, 100 - deduction),
      findingCount: own.length,
    };
  });
}

export function audit(page: PolishPage, themeId?: string): AuditResult {
  const theme = getTheme(themeId);
  const findings = runRules(page, theme.id);
  const dimensions = scoreDimensions(findings);

  const totalWeight = SCORE_DIMENSIONS.reduce((sum, d) => sum + DIMENSION_WEIGHTS[d], 0);
  const overall = Math.round(
    dimensions.reduce((sum, d) => sum + d.score * DIMENSION_WEIGHTS[d.dimension], 0) / totalWeight,
  );

  return {
    themeId: theme.id,
    themeName: theme.name,
    overall,
    grade: gradeFor(overall),
    dimensions,
    findings,
    summary: {
      high: findings.filter((f) => f.severity === "high").length,
      medium: findings.filter((f) => f.severity === "medium").length,
      low: findings.filter((f) => f.severity === "low").length,
      autoFixable: findings.filter((f) => f.ops.some((op) => !op.destructive)).length,
    },
  };
}

export function formatAuditSummary(result: AuditResult): string {
  const { summary, overall, grade, themeName } = result;
  const dims = result.dimensions.map((d) => `${d.label} ${d.score}`).join(" · ");
  return [
    `主题「${themeName}」评分 ${overall}/100（${grade}）`,
    dims,
    `问题 ${summary.high} 高 / ${summary.medium} 中 / ${summary.low} 低，其中 ${summary.autoFixable} 条可自动修复`,
  ].join("\n");
}
