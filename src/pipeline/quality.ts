/**
 * Standing quality bar for a course lecture.
 *
 * 跳步 = Fail
 * 无推导的复杂公式 = Fail
 * 讲解过浅 = Fail
 * 内容未过关就美化 = Fail
 */

export const QUALITY_FAIL = {
  skipStep: "跳步 = Fail",
  missingDerivation: "无推导的复杂公式 = Fail",
  shallowExplanation: "讲解过浅 = Fail",
  beautifyBeforeContent: "内容未过关就美化 = Fail",
  placeholder: "占位图当配图 = Fail",
} as const;

const CJK = /[\u3400-\u9fff]/g;

/**
 * Short boxes are not the lecture body. A page-number note, a self-test,
 * exam points, a comparison table, or a step-by-step derivation may stay short.
 */
const EXEMPT_BOX =
  /页码|幻灯片编号|PPT\s*第|第\s*\d+\s*\/\s*\d+|使用说明|自测|检查题|考试要点|Exam Tips|考点|对照表|逐步推导|^推导[:：]/i;

const EXEMPT_BOX_MAX = 280;

function cjkCount(text: string): number {
  return text.match(CJK)?.length ?? 0;
}

function wordCount(text: string): number {
  return text.split(/[^\p{L}\p{N}]+/u).filter((word) => /[A-Za-z]/.test(word)).length;
}

function isExplanatorySegment(segment: string): boolean {
  const cjk = cjkCount(segment);
  const words = wordCount(segment);
  if (cjk >= 8 && /是|把|因为|所以|如果|当|得到|从而|于是|意味着|可以|会|要|用来|对着/.test(segment)) return true;
  if (cjk >= 12) return true;
  if (words >= 8) return true;
  if (words >= 6 && /\b(is|are|because|when|if|so|means|shows|substitute|therefore|this|that)\b/i.test(segment)) return true;
  return false;
}

function isTopicLabel(segment: string): boolean {
  if (!segment || isExplanatorySegment(segment)) return false;
  const cjk = cjkCount(segment);
  const words = wordCount(segment);
  if (cjk === 0 && words === 0) return false;
  if (cjk > 0 && cjk <= 8 && words <= 4) return true;
  if (cjk === 0 && words > 0 && words <= 5) return true;
  return false;
}

function segmentsOf(text: string): string[] {
  return text
    .split(/\n+|[。！？!?；;]+/)
    .flatMap((piece) => piece.split(/\s*[、，,/|]\s*/))
    .map((piece) => piece.replace(/^(?:[-*•]+\s*|\d+\s*[.、．)]\s*)/, "").trim())
    .filter(Boolean);
}

/**
 * An outline pasted as the lecture: several topic labels, in Chinese or
 * English, and no sentence that says what the step does or why.
 * Language alone is not this failure. Exempt short boxes return false.
 */
export function isShallowExplanation(text: string): boolean {
  const raw = text.replace(/\r/g, "").trim();
  if (!raw) return false;
  if (raw.length <= EXEMPT_BOX_MAX && EXEMPT_BOX.test(raw)) return false;
  const segments = segmentsOf(raw);
  if (segments.some(isExplanatorySegment)) return false;
  const labels = segments.filter(isTopicLabel);
  return labels.length >= 3;
}

/** A formula needs the intermediate lines written out, not only the last expression. */
export const COMPLEX_FORMULA = /\\frac|\\sum|\\int|\\begin|\\nabla|\\lim|\\prod|cases|aligned/;

export const HANDWAVE = /显然|不难看出|容易得到|同理可得|略去|证明略|此处略|it is obvious|clearly,|trivial|left to the reader/i;

/** LaTeX commands sitting in prose, not inside an equation. */
export const PSEUDO_LATEX = /\\(?:frac|sum|int|nabla|theta|alpha|beta|mathbb|begin|end|left|right)\b/;
