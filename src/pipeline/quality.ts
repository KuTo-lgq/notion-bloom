/**
 * Standing quality bar for a course lecture.
 *
 * 跳步 = Fail
 * 无推导的复杂公式 = Fail
 * 内容未过关就美化 = Fail
 */

export const QUALITY_FAIL = {
  skipStep: "跳步 = Fail",
  missingDerivation: "无推导的复杂公式 = Fail",
  beautifyBeforeContent: "内容未过关就美化 = Fail",
  placeholder: "占位图当配图 = Fail",
} as const;

/** A formula needs the intermediate lines written out, not only the last expression. */
export const COMPLEX_FORMULA = /\\frac|\\sum|\\int|\\begin|\\nabla|\\lim|\\prod|cases|aligned/;

export const HANDWAVE = /显然|不难看出|容易得到|同理可得|略去|证明略|此处略|it is obvious|clearly,|trivial|left to the reader/i;

/** LaTeX commands sitting in prose, not inside an equation. */
export const PSEUDO_LATEX = /\\(?:frac|sum|int|nabla|theta|alpha|beta|mathbb|begin|end|left|right)\b/;
