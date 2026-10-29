/**
 * PPT → lecture → content gate → bloom → Notion.
 *
 * Bloom is the last stage. It does not run while the content gate is failing.
 */

export const PIPELINE_STAGES = ["ingest", "generate", "content_gate", "beautify", "publish"] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export type IngestSlide = {
  number: number;
  title: string;
  /** Chapter kicker from the slide, used to merge segments. */
  chapter: string;
  text: string;
  hasImage: boolean;
  /** The pptx author placed a picture on this slide. A rendered PDF page is not this. */
  embedded?: boolean;
  /** Full-slide render, when ingest could make one. */
  imageFile?: string;
};

export type DeckIngest = {
  sourcePath: string;
  slides: IngestSlide[];
};

export type LectureFormula = {
  id: string;
  /** KaTeX source, without surrounding dollar signs. */
  expression: string;
  display: "inline" | "block";
  /** Lines between the previous statement and this expression. Empty is a fail when `complex` is true. */
  derivation: string[];
};

export type LectureStep = {
  n: number;
  text: string;
};

export type LectureCallout = {
  icon: string;
  tone: "exam" | "definition" | "warning" | "example";
  text: string;
};

export type FigureSlot = {
  needed: boolean;
  /** Real slide render. A tiny embedded file does not count. */
  file?: string;
  real: boolean;
  /** Shown in the draft when no real render exists. Does not by itself pass the gate. */
  missingMark: boolean;
};

export type LectureTable = {
  headers: string[];
  rows: string[][];
};

export type LectureSection = {
  id: string;
  chapter: string;
  titleZh: string;
  titleEn: string;
  prose: string;
  steps: LectureStep[];
  formulas: LectureFormula[];
  /** Plain-language example. Key sections need one. */
  example: string;
  /** Exam point, definition, or common mistake, ready for a Notion callout. */
  callouts: LectureCallout[];
  /** Formula text on the slide that is not faithful LaTeX. It is not rewritten. */
  unparsedMath: string[];
  /** A real comparison table. Prose that only names the algorithms does not count. */
  table?: LectureTable;
  /**
   * False folds this section under the previous heading. Use it to keep a
   * screenshot without giving every consecutive slide its own H2.
   */
  showHeading?: boolean;
  figure: FigureSlot;
  /** Exam point, definition, or common mistake, marked for a callout. */
  marked: boolean;
};

export type LectureDraft = {
  title: string;
  /** Short roadmap shown at the top of the page. Not a writing manual. */
  roadmap: string;
  sections: LectureSection[];
  /** Notes that are not gate failures. Example: the deck has no practice questions. */
  alignmentNotes: string[];
  /**
   * Who picks the lecture language. Omitted means `user`: follow the calling
   * agent's prompt, and do not fail for being only one language.
   * `bilingual` opts into paired-script headings and deck mottos. Use it when
   * the user asked for that, not as the package default.
   */
  locale?: "user" | "bilingual";
  /**
   * Set by the pipeline from the deck. Full-lecture rules (page citations,
   * worked examples, figure minimum) run only when this is present.
   */
  deck?: { pageCount: number; text: string };
};

export type GateRule =
  | "skip_step"
  | "missing_derivation"
  | "broken_formula"
  | "pseudo_latex"
  | "missing_figure"
  | "missing_example"
  | "beautify_before_content"
  | "missing_citation"
  | "missing_worked_example"
  | "leaked_escape"
  | "double_number"
  | "missing_self_test"
  | "missing_comparison"
  | "thin_coverage"
  | "example_drift"
  | "thin_self_test"
  | "fragmented_outline"
  | "monolingual_heading"
  | "missing_usage_note"
  | "missing_cross_lecture"
  | "wrong_claim"
  | "missing_update"
  | "missing_step_names"
  | "missing_practice_code"
  | "thin_pseudocode"
  | "thin_adam"
  | "thin_derivation"
  | "thin_research"
  | "missing_interactive_calc"
  | "over_fragmented_h2"
  | "missing_bilingual_example";

export type GateFailure = {
  rule: GateRule;
  where: string;
  message: string;
};

export type ContentGate = {
  pass: boolean;
  failures: GateFailure[];
};
