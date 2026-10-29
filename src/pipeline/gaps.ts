/**
 * Holes the deck did not fill. Nothing here is invented.
 *
 * A gap keeps the content gate failing until a person or a later model
 * writes the missing step, derivation, or example.
 *
 * 跳步 = Fail
 * 无推导的复杂公式 = Fail
 * 内容未过关就美化 = Fail
 */

import { COMPLEX_FORMULA } from "./quality";
import type { LectureDraft } from "./types";

export type LectureGap = {
  where: string;
  slide?: number;
  kind: "derivation" | "example" | "figure" | "steps";
  message: string;
  /** What to add on the slide. It names the hole. It does not supply a new formula. */
  hint: string;
};

export function listGaps(draft: LectureDraft): LectureGap[] {
  const gaps: LectureGap[] = [];
  for (const section of draft.sections) {
    const where = section.titleZh || section.id;
    const slide = Number(section.id.replace("slide-", "")) || undefined;
    if (section.steps.length === 0) {
      gaps.push({
        where,
        slide,
        kind: "steps",
        message: "这一节没有可跟随的步骤。课件没写，这里不编。",
        hint: `在第 ${slide ?? "?"} 页用 1. 2. 3. 写下已经出现的操作，不要跳号，也不要写「显然」。`,
      });
    }
    for (const formula of section.formulas) {
      if (COMPLEX_FORMULA.test(formula.expression) && formula.derivation.length === 0) {
        gaps.push({
          where,
          slide,
          kind: "derivation",
          message: `复杂公式缺少推导：${formula.expression.slice(0, 80)}。课件没写中间行，这里不编。`,
          hint: `在第 ${slide ?? "?"} 页该公式的上一行起，补「推导：」行，只复述课件里已有的中间等式。不要新写课件没有的式子。`,
        });
      }
    }
    if (section.marked && !section.example.trim()) {
      gaps.push({
        where,
        slide,
        kind: "example",
        message: "标了考点或定义，课件没有「例如」。这里不编例子。",
        hint: `在第 ${slide ?? "?"} 页补一行「例如：」，用课件里已经给出的数字或情形。没有现成数字就不要编。`,
      });
    }
    for (const raw of section.unparsedMath) {
      gaps.push({
        where,
        slide,
        kind: "derivation",
        message: `公式无法忠实写成 LaTeX：${raw.slice(0, 80)}`,
        hint: `打开第 ${slide ?? "?"} 页，按幻灯片上的符号手写中间行，并标成「推导：」。不要根据截图猜一个新式子交给生成器。`,
      });
    }
    if (section.figure.needed && !section.figure.real) {
      gaps.push({
        where,
        slide,
        kind: "figure",
        message: section.figure.file
          ? "抽到的是占位图，不能当作幻灯片截图。"
          : "这一页没有渲出幻灯片截图，正文标了【图缺】。",
        hint: `重新导出第 ${slide ?? "?"} 页的整页截图。不要用 1 像素占位图。没有截图就不能当已配图。`,
      });
    }
  }
  return gaps;
}
