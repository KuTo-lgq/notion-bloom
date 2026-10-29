import assert from "node:assert/strict";
import { test } from "node:test";

import { auditStructure } from "@/core/structure-audit";
import { reviewContent } from "@/pipeline/gate";
import type { LectureDraft } from "@/pipeline/types";
import type { PolishPage } from "@/core/types";

const deck = {
  pageCount: 58,
  text: "SGD Momentum Nesterov AdaGrad RMSProp Adam mini-batch epoch learning rate 0.972575 0.025942 0.013949",
};

function thin(): LectureDraft {
  return {
    title: "薄讲解",
    roadmap: "太短",
    alignmentNotes: [],
    deck,
    sections: [
      {
        id: "slide-16",
        chapter: "手算",
        titleZh: "前向",
        titleEn: "Forward",
        prose: "输入是 X\\_i，参数在 R\\^s。只写了前向，没有页码。",
        steps: [{ n: 1, text: "1. 代入数字。" }],
        formulas: [],
        example: "",
        callouts: [],
        unparsedMath: [],
        figure: { needed: false, real: false, missingMark: false },
        marked: false,
      },
    ],
  };
}

test("a thin full-deck lecture fails the fidelity rules the L03 pipeline page missed", () => {
  const rules = new Set(reviewContent(thin()).failures.map((failure) => failure.rule));
  for (const rule of [
    "missing_citation",
    "missing_self_test",
    "thin_self_test",
    "missing_comparison",
    "missing_figure",
    "thin_coverage",
    "missing_worked_example",
    "double_number",
    "leaked_escape",
    "missing_usage_note",
  ] as const) {
    assert.ok(rules.has(rule), rule);
  }
});

test("the same deck passes once citations, checks, comparison, and figures are present", () => {
  const figures = Array.from({ length: 8 }, (_, index) => ({
    id: `slide-${index + 2}`,
    chapter: `Part ${index} 章`,
    titleZh: `图示 ${index} Figure（PPT 第 ${index + 2}/58 页）`,
    titleEn: `Figure ${index}`,
    prose: index === 0 ? "使用说明：页码按幻灯片编号。手算保留 0.972575 与 0.025942。" : "这一节对着幻灯片讲。",
    steps: [{ n: 1, text: "按课件的顺序写。" }],
    formulas: [],
    example: "",
    callouts: [],
    unparsedMath: [],
    figure: { needed: true, real: true, file: `/tmp/s${index}.png`, missingMark: false },
    marked: false,
  }));
  const draft: LectureDraft = {
    title: "完整讲解",
    roadmap: "主线",
    alignmentNotes: [],
    deck,
    sections: [
      ...figures,
      {
        id: "slide-52",
        chapter: "训练实践 Training",
        titleZh: "小批量 Mini-batch（PPT 第 52/58 页）",
        titleEn: "Mini-batch",
        prose: "批量是若干样本梯度的平均。",
        steps: [],
        formulas: [],
        example: "",
        callouts: [],
        unparsedMath: [],
        figure: { needed: false, real: false, missingMark: false },
        marked: false,
      },
      {
        id: "slide-54",
        chapter: "训练实践 Training",
        titleZh: "epoch 轮次（PPT 第 53/58 页）",
        titleEn: "Epoch",
        prose: "一个 epoch 是把数据过一遍。",
        steps: [],
        formulas: [],
        example: "",
        callouts: [],
        unparsedMath: [],
        figure: { needed: false, real: false, missingMark: false },
        marked: false,
      },
      {
        id: "slide-55",
        chapter: "训练实践 Training",
        titleZh: "学习率日程 Schedule（PPT 第 54/58 页）",
        titleEn: "Schedule",
        prose: "按 epoch 把学习率乘上一个小于 1 的因子。下面这张表是六种算法的比较。",
        steps: [],
        formulas: [],
        example: "",
        callouts: [],
        table: {
          headers: ["算法", "状态", "更新"],
          rows: [
            ["SGD", "无", "减去步长乘梯度"],
            ["Momentum", "梯度平均", "减去步长乘平均"],
            ["Nesterov", "速度", "先看前瞻点"],
            ["AdaGrad", "平方和", "按坐标缩小"],
            ["RMSProp", "平方平均", "旧记忆会褪色"],
            ["Adam", "一阶和二阶", "先做偏差校正"],
          ],
        },
        unparsedMath: [],
        figure: { needed: false, real: false, missingMark: false },
        marked: false,
      },
      {
        id: "slide-56",
        chapter: "收束 Close",
        titleZh: "自测 Practice（PPT 第 56/58 页）",
        titleEn: "Self-test",
        prose: "自测。上一讲把梯度定义好，下一讲会用这些更新去训练。Q1 分叉在指定点把两条路径乘完再相加，不要漏路径。答案：两条贡献相加得到课件上的那个和。Q2 感知机先算线性组合，再过 sigmoid，再乘局部斜率。答案：四个梯度都由同一个 δ 乘输入得到。Q3 两层网络先写输出层的梯度，再把灵敏度乘回第一层。答案：输出层是误差乘隐藏激活的转置。Q4 动量两步里，方向相反的分量会被平均掉一部分。答案：第二步在变号的坐标上比单步梯度小。Q5 一个 epoch 的更新次数由样本数除以批量再向上取整。答案：最后不满一批也要单独更新一次。",
        steps: [],
        formulas: [],
        example: "",
        callouts: [
          {
            icon: "🎯",
            tone: "exam",
            text: "考试要点 Exam Tips：\n1. 分叉是路径内相乘、路径间相加。\n2. 感知机要能手算四个梯度。\n3. 动量两步要会算抵消。\n4. AdaGrad 的大梯度不会走出大步。\n5. 一个 epoch 的更新次数按批量来数。",
          },
        ],
        table: {
          headers: ["本讲", "接到哪里"],
          rows: [
            ["梯度的定义", "上一讲交来的局部导数"],
            ["反向和更新", "这一讲自己讲完"],
            ["卷积里的共享权重", "下一讲把分叉处的梯度加起来"],
          ],
        },
        unparsedMath: [],
        figure: { needed: false, real: false, missingMark: false },
        marked: false,
      },
    ],
  };
  const gate = reviewContent(draft);
  assert.deepEqual(gate.failures.map((failure) => failure.rule), []);
  assert.equal(gate.pass, true);
});

test("audit_structure flags double numbering and leaked escapes", () => {
  const page: PolishPage = {
    id: "p",
    title: "页",
    blocks: [
      { id: "n", type: "numbered_list_item", richText: [{ text: "1. 1. 代入" }] },
      { id: "e", type: "paragraph", richText: [{ text: "参数 θ\\_k 在 R\\^s 里。" }] },
    ],
  };
  const rules = auditStructure(page).findings.map((finding) => finding.ruleId);
  assert.ok(rules.includes("double-number"));
  assert.ok(rules.includes("leaked-escape"));
});

test("the default locale does not require a second language", () => {
  const rules = new Set(reviewContent(thin()).failures.map((failure) => failure.rule));
  assert.equal(rules.has("monolingual_heading"), false);
  assert.equal(rules.has("missing_bilingual_example"), false);
  assert.equal(rules.has("missing_cross_lecture"), false);
});

test("bilingual locale opts into paired headings and a cross-lecture table", () => {
  const draft = thin();
  draft.locale = "bilingual";
  const rules = new Set(reviewContent(draft).failures.map((failure) => failure.rule));
  assert.ok(rules.has("monolingual_heading"));
  assert.ok(rules.has("missing_cross_lecture"));
});

test("a research timeline and an interactive update cannot be a short note", () => {
  const draft = thin();
  draft.deck = { pageCount: 58, text: `${deck.text} Adam Kingma Reddi AMSGrad counterexample Take one update` };
  draft.sections[0].chapter = "研究 Research";
  draft.sections[0].prose = "使用说明：页码按幻灯片。Kingma 在 2015 提出 Adam。";
  const rules = new Set(reviewContent(draft).failures.map((failure) => failure.rule));
  assert.ok(rules.has("thin_research"));
  assert.ok(rules.has("missing_interactive_calc"));
});

test("a bare w_0 and the wrong Zhang inequality fail", () => {
  const draft = thin();
  draft.deck = { ...deck, text: `${deck.text} Zhang bias` };
  draft.sections[0].prose = "使用说明：页码在 PPT 第 1 页。权重写成 w_0。Zhang 写的是 β₁ < β₂。";
  draft.sections[0].chapter = "手算 Example";
  const rules = new Set(reviewContent(draft).failures.map((failure) => failure.rule));
  assert.ok(rules.has("leaked_escape"));
  assert.ok(rules.has("wrong_claim"));
});
