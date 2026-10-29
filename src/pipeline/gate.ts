/**
 * Content gate. Bloom is not allowed to start while this fails.
 *
 * 跳步 = Fail
 * 无推导的复杂公式 = Fail
 * 内容未过关就美化 = Fail
 */

import { checkKatex, LEAKED_ESCAPE, statesSqrtBetaOrder, wrongBetaOrder } from "@/core/formulas";

import { COMPLEX_FORMULA, HANDWAVE, PSEUDO_LATEX, QUALITY_FAIL } from "./quality";
import type { ContentGate, GateFailure, LectureDraft, LectureFormula } from "./types";

function skippedNumbers(steps: Array<{ n: number }>): number[] {
  const nums = [...new Set(steps.map((step) => step.n))].sort((a, b) => a - b);
  const missing: number[] = [];
  for (let i = 1; i < nums.length; i += 1) {
    for (let n = nums[i - 1] + 1; n < nums[i]; n += 1) missing.push(n);
  }
  return missing;
}

function formulaFailures(formula: LectureFormula, where: string): GateFailure[] {
  const failures: GateFailure[] = [];
  const broken = checkKatex(formula.expression);
  if (broken) {
    failures.push({
      rule: "broken_formula",
      where,
      message: `公式无效：${broken}`,
    });
  }
  const complex = COMPLEX_FORMULA.test(formula.expression);
  if (complex && formula.derivation.filter((line) => line.trim()).length === 0) {
    failures.push({
      rule: "missing_derivation",
      where,
      message: `${QUALITY_FAIL.missingDerivation}（${formula.expression.slice(0, 80)}）`,
    });
  }
  return failures;
}

export function reviewContent(draft: LectureDraft): ContentGate {
  const failures: GateFailure[] = [];
  for (const section of draft.sections) {
    const where = section.titleZh || section.id;
    const missing = skippedNumbers(section.steps);
    if (missing.length > 0) {
      failures.push({
        rule: "skip_step",
        where,
        message: `${QUALITY_FAIL.skipStep} 缺第 ${missing.join("、")} 步。`,
      });
    }
    if (HANDWAVE.test(section.prose) || section.steps.some((step) => HANDWAVE.test(step.text))) {
      failures.push({
        rule: "skip_step",
        where,
        message: `${QUALITY_FAIL.skipStep} 用「显然 / 略」带过了推导。`,
      });
    }
    const prose = [section.prose, ...section.steps.map((step) => step.text)].join("\n");
    if (PSEUDO_LATEX.test(prose)) {
      failures.push({
        rule: "pseudo_latex",
        where,
        message: "正文里有伪 LaTeX。公式放进行内 $...$ 或单独成行，不要写在散文里。",
      });
    }
    for (const formula of section.formulas) failures.push(...formulaFailures(formula, where));
    for (const raw of section.unparsedMath) {
      failures.push({
        rule: "broken_formula",
        where,
        message: `幻灯片上的公式抽出来不是 LaTeX，不转写以免写错：${raw.slice(0, 80)}`,
      });
    }
    if (section.figure.needed && !section.figure.real) {
      failures.push({
        rule: "missing_figure",
        where,
        message: section.figure.file
          ? `${QUALITY_FAIL.placeholder} 抽到的图不是幻灯片截图。`
          : "抽不到幻灯片截图，已标【图缺】，内容审不通过。",
      });
    }
    if (section.marked && !section.example.trim()) {
      failures.push({
        rule: "missing_example",
        where,
        message: "标了考点或定义，但没有白话例子。",
      });
    }
    for (const step of section.steps) {
      if (/^\s*\d+\s*[.、．]/.test(step.text)) {
        failures.push({
          rule: "double_number",
          where,
          message: "步骤文字又写了一遍序号。放进编号列表后会变成「1. 1.」。",
        });
      }
    }
    const visible = outsideMath(
      [
        section.titleZh,
        section.prose,
        section.example,
        ...section.steps.map((step) => step.text),
        ...section.callouts.map((callout) => callout.text),
        ...section.formulas.flatMap((formula) => formula.derivation),
        ...(section.table ? [section.table.headers.join(" "), ...section.table.rows.map((row) => row.join(" "))] : []),
      ].join("\n"),
    );
    if (LEAKED_ESCAPE.test(visible)) {
      failures.push({
        rule: "leaked_escape",
        where,
        message: "正文里有 \\_、\\^ 或 w_0 这种下标，没有放进公式。Notion 会把下划线当成普通字符印出来。",
      });
    }
  }
  failures.push(...lectureFidelity(draft));
  return { pass: failures.length === 0, failures };
}

const OPTIMIZERS = ["SGD", "动量", "Momentum", "Nesterov", "AdaGrad", "RMSProp", "Adam"];

function blobOf(draft: LectureDraft): string {
  return draft.sections
    .map((section) =>
      [section.chapter, section.titleZh, section.prose, section.example, ...section.steps.map((step) => step.text), ...section.callouts.map((item) => item.text)].join("\n"),
    )
    .join("\n");
}

function citesSlide(section: LectureDraft["sections"][number]): boolean {
  const text = `${section.titleZh}\n${section.prose}`;
  return /PPT\s*第|第\s*\d+\s*页|\d+\s*\/\s*\d+|slide\s+\d+|page\s+\d+/i.test(text);
}

function wantsBilingual(draft: LectureDraft): boolean {
  return draft.locale === "bilingual";
}

const SUPPLEMENT = /【补充|hand calculation|computed by hand|supplement/i;

function outsideMath(text: string): string {
  return text.replace(/\$[^$]*\$/g, " ");
}

function formulaText(draft: LectureDraft): string {
  return draft.sections.flatMap((section) => section.formulas.flatMap((formula) => [formula.expression, ...formula.derivation])).join("\n");
}

function tableText(section: LectureDraft["sections"][number]): string {
  if (!section.table) return "";
  return [section.table.headers.join(" "), ...section.table.rows.map((row) => row.join(" "))].join("\n");
}

const CJK = /[\u3400-\u9fff]/;
const LATIN = /[A-Za-z]/;

function bilingualHeading(text: string): boolean {
  return CJK.test(text) && LATIN.test(text);
}

/** Extra Fail rules for a full deck. Short fixtures never reach them. */
function lectureFidelity(draft: LectureDraft): GateFailure[] {
  const deck = draft.deck;
  if (!deck || deck.pageCount < 40) return [];
  const failures: GateFailure[] = [];
  const blob = blobOf(draft);
  const byChapter = new Map<string, LectureDraft["sections"]>();
  for (const section of draft.sections) {
    const list = byChapter.get(section.chapter) ?? [];
    list.push(section);
    byChapter.set(section.chapter, list);
  }
  for (const [chapter, sections] of byChapter) {
    if (!sections.some(citesSlide)) {
      failures.push({
        rule: "missing_citation",
        where: chapter,
        message: `「${chapter}」没有课件页码。大节要写「PPT 第 n/${deck.pageCount} 页」或「第 n 页」。`,
      });
    }
  }
  if (!/自测|考试要点|Exam Tips|检查题|self-?test|practice question|quiz|exercise/i.test(blob)) {
    failures.push({
      rule: "missing_self_test",
      where: draft.title,
      message: "整讲没有自测。用讲解所用的语言写一组检查题，不要只在正文里夹几个要点。",
    });
  }
  const practice = [...blob.matchAll(/\b(?:Q|Question)\s*(\d+)([\s\S]*?)(?=\b(?:Q|Question)\s*\d+|$)/gi)];
  const solid = practice.filter((match) => /答案|answer/i.test(match[2] ?? "") && (match[2]?.length ?? 0) >= 40);
  const examBullets = draft.sections.reduce((count, section) => {
    return (
      count +
      section.callouts
        .filter((callout) => /考试要点|Exam Tips|Practice|Review/i.test(callout.text))
        .reduce((n, callout) => n + callout.text.split("\n").filter((line) => /^\s*\d{1,2}\s*[.、．]/.test(line)).length, 0)
    );
  }, 0);
  if (solid.length < 5 || examBullets < 5) {
    failures.push({
      rule: "thin_self_test",
      where: draft.title,
      message: "至少 5 道带过程的练习，每题写出答案。要点单独成框，至少 5 条，每条一行，用「1.」开头。用讲解所用的语言来写。",
    });
  }
  if (!/使用说明|幻灯片编号|page numbers?|slide numbers?|how to cite|slides are numbered/i.test(blob)) {
    failures.push({
      rule: "missing_usage_note",
      where: draft.title,
      message: "页首用讲解所用的语言写明页码怎么对应课件，例如幻灯片编号或 slide number。",
    });
  }
  if (wantsBilingual(draft)) {
    const linked = draft.sections.some((section) => {
      const local = `${section.titleZh}\n${section.prose}\n${tableText(section)}`;
      const rows = section.table?.rows.length ?? 0;
      return rows >= 3 && /上一讲|前一讲|previous lecture|earlier lecture/i.test(local) && /下一讲|后一讲|next lecture|later lecture|卷积/i.test(local);
    });
    if (!linked) {
      failures.push({
        rule: "missing_cross_lecture",
        where: draft.title,
        message: "双语档要求一张至少三行的联系表，写清上一讲交来什么、下一讲拿走什么。默认语言档不查这一条。",
      });
    }
  }
  const named = OPTIMIZERS.filter((name) => new RegExp(name, "i").test(deck.text));
  const compared = draft.sections.some((section) => {
    const local = [section.titleZh, section.prose, section.example, tableText(section), ...section.callouts.map((callout) => callout.text)].join("\n");
    const tableCount = OPTIMIZERS.filter((name) => new RegExp(name, "i").test(tableText(section))).length;
    const rows = section.table?.rows.length ?? 0;
    return /比较|对照|compar/i.test(local) && tableCount >= 4 && rows >= 4;
  });
  if (named.length >= 4 && !compared) {
    failures.push({
      rule: "missing_comparison",
      where: draft.title,
      message: "课件讲了多种优化器，讲解里没有一张真正的对照表（表内至少四种，并写明比较或对照）。一段散文加点名不够。",
    });
  }
  const visibleHeadings = draft.sections.filter((section) => section.showHeading !== false);
  if (deck.pageCount >= 50 && visibleHeadings.length > 28) {
    failures.push({
      rule: "over_fragmented_h2",
      where: draft.title,
      message: `二级标题有 ${visibleHeadings.length} 个。连续几页的同一件事收成一节，不要每页一个标题。配图可以留在不另起标题的续段里。`,
    });
  }
  if (wantsBilingual(draft)) {
    for (const section of visibleHeadings) {
      if (!bilingualHeading(section.titleZh)) {
        failures.push({
          rule: "monolingual_heading",
          where: section.titleZh || section.id,
          message: `双语档要求二级标题「${section.titleZh}」同时有两种文字。默认语言档不查这一条。`,
        });
      }
    }
    const mottos = [
      "Multiply within each path",
      "negative input reverses",
      "does not establish a universal ranking",
      "Strong empirical performance does not by itself",
    ].filter((motto) => new RegExp(motto, "i").test(deck.text));
    for (const motto of mottos) {
      const boxed = draft.sections.some((section) =>
        section.callouts.some((callout) => new RegExp(motto, "i").test(callout.text) && CJK.test(callout.text) && LATIN.test(callout.text)),
      );
      if (!boxed) {
        failures.push({
          rule: "missing_bilingual_example",
          where: motto,
          message: `双语档要求把课件原句「${motto}」放进例题框，并配上另一种语言。默认语言档不强制翻译。`,
        });
      }
    }
    for (const chapter of byChapter.keys()) {
      if (!bilingualHeading(chapter)) {
        failures.push({
          rule: "monolingual_heading",
          where: chapter,
          message: `双语档要求一级标题「${chapter}」同时有两种文字，例如「反向传播 Backpropagation」。默认不强制。`,
        });
      }
    }
  }
  if (byChapter.size > 14) {
    failures.push({
      rule: "fragmented_outline",
      where: draft.title,
      message: `一级标题有 ${byChapter.size} 个。大章大约十来个，小节用二级标题，不要把每一页做成一级标题。`,
    });
  }
  if (deck.pageCount >= 50) {
    const figures = draft.sections.filter((section) => section.figure.real && section.figure.file).length;
    if (figures < 8) {
      failures.push({
        rule: "missing_figure",
        where: draft.title,
        message: `约 ${deck.pageCount} 页的课件只配了 ${figures} 张真实截图。关键示意图至少 8 张，每章最多 3 张，不要贴成图册。`,
      });
    }
  }
  if (/mini-batch|minibatch|epoch|learning rate/i.test(deck.text)) {
    const topics = [/批量|mini-batch|minibatch|batch size/i, /epoch/i, /学习率|learning rate/i];
    const split = topics.filter((topic) =>
      draft.sections.some((section) => topic.test(section.titleZh) && topics.every((other) => other === topic || !other.test(section.titleZh))),
    );
    if (split.length < 3) {
      failures.push({
        rule: "thin_coverage",
        where: "训练实践",
        message: "课件把小批量、epoch、学习率日程分开讲。不能压成一小节就当覆盖了。",
      });
    }
  }
  const decimals = [...deck.text.matchAll(/\d+\.\d{4,}/g)].map((match) => match[0]);
  const unique = [...new Set(decimals)];
  if (unique.length >= 3) {
    const kept = unique.filter((value) => blob.includes(value));
    if (kept.length < 2) {
      failures.push({
        rule: "missing_worked_example",
        where: draft.title,
        message: "课件里的手算小数几乎没进讲解。把幻灯片上的那组数按原样写进推导，不要换成另一道题。",
      });
    }
  }
  for (const section of draft.sections) {
    if (SUPPLEMENT.test(`${section.prose}\n${section.example}`)) continue;
    const local = [section.prose, section.example, ...section.steps.map((step) => step.text)].join("\n");
    for (const match of local.matchAll(/\d+\.\d{4,}/g)) {
      if (!deck.text.includes(match[0])) {
        failures.push({
          rule: "example_drift",
          where: section.titleZh || section.id,
          message: `例子里的 ${match[0]} 不在课件原文中。要改题必须标明【补充】，否则沿用幻灯片上的数。`,
        });
        break;
      }
    }
  }
  if (/3x/.test(deck.text) && /sum over paths|paths branch/i.test(deck.text)) {
    const fork = /x\^2|x\^\{2\}|x²/.test(blob) && /3x/.test(blob) && /y\s*[₁1]\s*\+\s*y\s*[₂2]|y_1\s*\+\s*y_2/.test(blob);
    if (!fork) {
      failures.push({
        rule: "example_drift",
        where: "分叉",
        message: "分叉例子要与课件一致：y₁ = x²，y₂ = 3x，z = y₁ + y₂。不要改成先平方再相加的另一道题。",
      });
    }
  }
  if (/take one update/i.test(deck.text) && unique.length >= 6) {
    const extras = new Set<string>();
    for (const section of draft.sections) {
      if (!SUPPLEMENT.test(`${section.prose}\n${section.example}`)) continue;
      const local = [section.prose, section.example, ...section.steps.map((step) => step.text)].join("\n");
      for (const match of local.matchAll(/\d+\.\d{4,}/g)) {
        if (!deck.text.includes(match[0])) extras.add(match[0]);
      }
    }
    if (extras.size < 4 || !/新损失|更新后/.test(blob)) {
      failures.push({
        rule: "missing_update",
        where: draft.title,
        message: "课件有一步更新。要写出更新后的权重和新损失；正文没印出来的数标【补充】。",
      });
    }
  }
  const stepNames = ["Sample", "Differentiate", "Remember", "Update"].filter((name) => new RegExp(name).test(deck.text));
  if (stepNames.length >= 3) {
    const missing = stepNames.filter((name) => !blob.includes(name));
    if (missing.length > 0) {
      failures.push({
        rule: "missing_step_names",
        where: draft.title,
        message: `算法步骤要保留课件上的英文名：${missing.join("、")}。`,
      });
    }
  }
  if (/pytorch/i.test(deck.text) && /clear old gradient|zero_grad/i.test(deck.text)) {
    if (!/zero_grad/.test(blob)) {
      failures.push({
        rule: "missing_practice_code",
        where: draft.title,
        message: "课件要求下一步反向之前清掉旧梯度。写出 PyTorch 的 zero_grad。",
      });
    }
  }
  if (/mini-batch|minibatch/i.test(deck.text) && /Sample/.test(deck.text)) {
    const mini = draft.sections.find((section) => /批量/.test(section.titleZh) && !/epoch|学习率/.test(section.titleZh));
    if (!mini || mini.steps.length < 4) {
      failures.push({
        rule: "thin_pseudocode",
        where: "小批量",
        message: "小批量训练要保留完整步骤，不能只写一句平均梯度。",
      });
    }
  }
  if (/adam/i.test(deck.text) && /bias/i.test(deck.text)) {
    const math = `${blob}\n${formulaText(draft)}`;
    const corrected = /1\s*[-−]\s*β|1\s*[-−]\s*\\beta/.test(math);
    const why = /为什么|从\s*0|从零|一开始|初值|startup/.test(blob);
    if (!corrected || !why) {
      failures.push({
        rule: "thin_adam",
        where: "Adam",
        message: "Adam 的偏差校正要写明：状态从 0 开始，所以要除以 1−β^{k+1}，并说明为什么。",
      });
    }
  }
  if (/adam/i.test(deck.text) && /AMSGrad|Kingma|Reddi|Zhang|counterexample/i.test(deck.text)) {
    const papers = ["Kingma", "Reddi", "Shi", "Zhang", "AMSGrad"].filter((name) => blob.includes(name));
    const years = ["2015", "2018", "2021", "2022"].filter((year) => blob.includes(year));
    const rows = draft.sections
      .filter((section) => /研究|Kingma|Reddi|Zhang|AMSGrad/.test(`${section.titleZh}\n${section.prose}\n${tableText(section)}`))
      .reduce((count, section) => count + (section.table?.rows.length ?? 0), 0);
    if (papers.length < 3 || years.length < 3 || rows < 3) {
      failures.push({
        rule: "thin_research",
        where: "研究故事",
        message: "课件有 Adam 的研究时间线。要做成按年份展开的表，至少三篇、三个年份，不能收成一段话。",
      });
    }
  }
  if (/take one update/i.test(deck.text)) {
    const worked = draft.sections.filter((section) => SUPPLEMENT.test(`${section.prose}\n${section.example}`));
    const extras = new Set<string>();
    for (const section of worked) {
      const local = [section.prose, section.example, ...section.steps.map((step) => step.text)].join("\n");
      for (const match of local.matchAll(/\d+\.\d{4,}/g)) {
        if (!deck.text.includes(match[0])) extras.add(match[0]);
      }
    }
    const shown = worked.some((section) => section.steps.length >= 3);
    if (!shown || extras.size < 4) {
      failures.push({
        rule: "missing_interactive_calc",
        where: "一步更新",
        message: "课件这一页是交互演示，PDF 里没有更新后的数。用给定步长把新权重和新损失算出来并写出过程。课件没印出的数标【补充·手算】，或用讲解语言写 hand calculation。",
      });
    }
  }
  failures.push(...thinDerivations(draft, deck.text));
  if (/Zhang|张/.test(deck.text)) {
    const math = `${blob}\n${formulaText(draft)}`;
    if (wrongBetaOrder(math) || !statesSqrtBetaOrder(math)) {
      failures.push({
        rule: "wrong_claim",
        where: "Zhang",
        message: "Zhang 等人的条件是 β₁ < √β₂，不是 β₁ < β₂。",
      });
    }
  }
  return failures;
}

const MAJOR_SECTION = /链式|分叉|反向|神经元|感知机|手算|自动微分|随机梯度|鞍|极小|动量|Nesterov|AdaGrad|RMSProp|Adam|自适应|chain|branch|backprop|neuron|perceptron|autodiff|automatic differentiation|stochastic|saddle|momentum|adaptive/i;

function derivationMass(section: LectureDraft["sections"][number]): number {
  const steps = section.steps.map((step) => step.text).join("");
  const derived = section.formulas.flatMap((formula) => formula.derivation).join("");
  return steps.length + derived.length;
}

/** Major sections have to show the algebra, not a three-line outline. */
function thinDerivations(draft: LectureDraft, deckText: string): GateFailure[] {
  const failures: GateFailure[] = [];
  for (const section of draft.sections) {
    const label = `${section.chapter}\n${section.titleZh}`;
    if (/比较|研究|自测|考试|前后|compar|research|self-?test|practice|exam|links/i.test(section.titleZh)) continue;
    if (!MAJOR_SECTION.test(label)) continue;
    if (section.steps.length >= 3 && derivationMass(section) >= 180) continue;
    failures.push({
      rule: "thin_derivation",
      where: section.titleZh || section.id,
      message: `「${section.titleZh}」推导太短。大节要至少 3 步，并把每一步为什么这样做写出来。列出提纲不算讲完。`,
    });
  }
  if (/sum over paths|paths branch/i.test(deckText) && !/路径内相乘|每条路内部相乘|multiply within each path|sum over paths/i.test(blobOf(draft))) {
    failures.push({
      rule: "thin_derivation",
      where: "分叉",
      message: "链式法则要沿用课件自己的口诀，用讲解所用的语言写清路径内相乘、路径间相加。",
    });
  }
  if (/velocity/i.test(deckText) && /nesterov/i.test(deckText)) {
    const blob = blobOf(draft);
    const ema = /EMA|指数滑动/.test(blob);
    const heavy = /heavy-ball|重球/.test(blob);
    const velocity = /velocity|速度/.test(blob);
    if (!ema || !heavy || !velocity) {
      failures.push({
        rule: "thin_derivation",
        where: "动量",
        message: "动量要分开写 EMA、velocity、heavy-ball。幻灯片没有的那种标【补充】。",
      });
    }
  }
  return failures;
}

/** Beautify and publish both stop here. A failing gate is not a draft to pretty up. */
export function refuseBeautify(gate: ContentGate): { allowed: boolean; reason: string } {
  if (gate.pass) return { allowed: true, reason: "内容审过关，可以进入美化。" };
  return {
    allowed: false,
    reason: `${QUALITY_FAIL.beautifyBeforeContent} ${gate.failures.map((failure) => failure.message).join(" ")}`,
  };
}
