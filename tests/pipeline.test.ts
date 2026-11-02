import assert from "node:assert/strict";
import { test } from "node:test";

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { BLOOM_PROMPT, WRITE_LECTURE_PROMPT } from "@/mcp/prompts";
import { draftToBlocks, humanReviewBlocks } from "@/pipeline/blocks";
import { draftFromIngest } from "@/pipeline/draft";
import { runLecturePipeline } from "@/pipeline/run";
import { listGaps } from "@/pipeline/gaps";
import { refuseBeautify, reviewContent } from "@/pipeline/gate";
import { ingestDeck } from "@/pipeline/ingest";
import { writeLongLecture } from "@/pipeline/long-deck";
import { writeMiniLecture } from "@/pipeline/mini-deck";
import { applyBloomIfSafe, assertPublishParent, blocksAfterUpload, dryRunBloom, publishDraft } from "@/pipeline/publish";
import { isShallowExplanation, QUALITY_FAIL } from "@/pipeline/quality";
import type { PublishBlock } from "@/pipeline/blocks";
import type { LectureDraft } from "@/pipeline/types";

const passing = (): LectureDraft => ({
  title: "梯度下降 Gradient Descent",
  roadmap: "写出更新 → 代入一步 → 看出何时发散",
  alignmentNotes: ["未对齐-课件无自测"],
  sections: [
    {
      id: "s1",
      chapter: "更新",
      titleZh: "步长太大会越过最优点",
      titleEn: "A step that is too large overshoots",
      prose: "方向对了也不够。把二次函数的梯度代进去，看 1-α 的绝对值。",
      steps: [
        { n: 1, text: "写出 R(θ)=θ²/2，梯度是 θ。" },
        { n: 2, text: "代入更新 θₜ₊₁ = θₜ − α θₜ。" },
        { n: 3, text: "得到 θₜ = (1−α)^t θ₀。绝对值大于 1 时发散。" },
      ],
      formulas: [
        {
          id: "f1",
          expression: "\\theta_{t+1}=(1-\\alpha)\\theta_t",
          display: "block",
          derivation: ["梯度是 θ。", "更新是 θₜ 减去 α 乘 θₜ。", "合并成 (1−α) 乘 θₜ。"],
        },
      ],
      example: "步长取 1.5 时，每一步换一次号，但离原点更近。",
      callouts: [{ icon: "🎯", tone: "exam", text: "考点：绝对值大于 1 就会发散。" }],
      unparsedMath: [],
      figure: { needed: true, file: "/tmp/p16.jpg", real: true, missingMark: false },
      marked: true,
    },
  ],
});

test("a complete derivation passes, and beautify stays closed until then", () => {
  const gate = reviewContent(passing());
  assert.equal(gate.pass, true);
  assert.equal(refuseBeautify(gate).allowed, true);
});

test("a chinese outline cannot be beautified", () => {
  const draft = passing();
  draft.sections[0].prose = "随机梯度\n动量\n学习率\n收敛";
  const gate = reviewContent(draft);
  assert.equal(gate.pass, false);
  assert.ok(gate.failures.some((failure) => failure.rule === "shallow_explanation" && failure.message.includes(QUALITY_FAIL.shallowExplanation)));
  assert.equal(refuseBeautify(gate).allowed, false);
  assert.ok(listGaps(draft).some((gap) => gap.kind === "explanation"));
});

test("an english outline cannot be beautified", () => {
  const draft = passing();
  draft.sections[0].prose = "Stochastic gradient\nMomentum\nLearning rate\nConvergence";
  const gate = reviewContent(draft);
  assert.equal(gate.pass, false);
  assert.ok(gate.failures.some((failure) => failure.rule === "shallow_explanation"));
  assert.equal(refuseBeautify(gate).allowed, false);
});

test("a thorough english lecture passes, and language is not a hard fail", () => {
  const draft = passing();
  draft.title = "Gradient descent";
  draft.roadmap = "Write the update, substitute one step, and see when it diverges.";
  draft.sections[0].titleZh = "A step that is too large overshoots";
  draft.sections[0].titleEn = "A step that is too large overshoots";
  draft.sections[0].prose =
    "The direction can be right and the iterate can still diverge. Substitute the gradient of the quadratic into the update and look at the absolute value of one minus the step size. When that value is greater than one, the iterates move away from the origin.";
  draft.sections[0].steps = [
    { n: 1, text: "Write R of theta as theta squared over two, so the gradient is theta." },
    { n: 2, text: "Substitute the update: the next theta is the current theta minus alpha times theta." },
    { n: 3, text: "This shows theta sub t equals one minus alpha to the t times theta zero, and it diverges when the absolute value exceeds one." },
  ];
  draft.sections[0].example = "With a step size of 1.5 the sign flips every step, but the point moves closer to the origin.";
  draft.sections[0].callouts = [{ icon: "🎯", tone: "exam", text: "Exam point: an absolute value greater than one diverges." }];
  draft.locale = "user";
  const gate = reviewContent(draft);
  assert.deepEqual(gate.failures, []);
  assert.equal(gate.pass, true);
  assert.equal(refuseBeautify(gate).allowed, true);
  assert.equal(gate.failures.some((failure) => failure.rule === "monolingual_heading"), false);
});

test("page notes, self-tests, exam points, tables, and derivations are not shallow", () => {
  assert.equal(isShallowExplanation("使用说明：幻灯片编号 12/40 就是引用页码。"), false);
  assert.equal(isShallowExplanation("自测：用课件上的数把这一步再算一遍。"), false);
  assert.equal(isShallowExplanation("考试要点\n1. 步长过大就发散。\n2. 动量会抵消变号。"), false);
  assert.equal(isShallowExplanation("对照表：SGD 与 Adam 记住的状态不同。"), false);
  assert.equal(isShallowExplanation("推导：\n1. 写出梯度\n2. 代入更新\n3. 合并系数"), false);
  assert.equal(isShallowExplanation("随机梯度\n动量\n学习率"), true);
  assert.equal(isShallowExplanation("Stochastic gradient, Momentum, Learning rate"), true);
});

test("prompts require a deep explanation and refuse a verbal beautify pass", () => {
  assert.match(WRITE_LECTURE_PROMPT, /讲解过浅 = Fail/);
  assert.match(WRITE_LECTURE_PROMPT, /只有 gate\.pass 为 true/);
  assert.match(WRITE_LECTURE_PROMPT, /口头说可以美化不算过关/);
  assert.match(BLOOM_PROMPT, /gate\.pass 已经是 true/);
  assert.match(BLOOM_PROMPT, /口头说可以美化不算过关/);
  assert.doesNotMatch(BLOOM_PROMPT, /调用方明确说内容可以美化/);
});

test("a skipped step fails and blocks beautify", () => {
  const draft = passing();
  draft.sections[0].steps = [
    { n: 1, text: "写出梯度。" },
    { n: 3, text: "得到通项。" },
  ];
  const gate = reviewContent(draft);
  assert.equal(gate.pass, false);
  assert.ok(gate.failures.some((failure) => failure.rule === "skip_step" && failure.message.includes(QUALITY_FAIL.skipStep)));
  assert.equal(refuseBeautify(gate).allowed, false);
  assert.match(refuseBeautify(gate).reason, /内容未过关就美化 = Fail/);
});

test("a complex formula with no derivation fails", () => {
  const draft = passing();
  draft.sections[0].formulas[0].derivation = [];
  draft.sections[0].formulas[0].expression = "\\frac{1}{T}\\sum_{t=0}^{T-1}\\|\\nabla R_n(\\theta_t)\\|^2";
  const gate = reviewContent(draft);
  assert.ok(gate.failures.some((failure) => failure.rule === "missing_derivation"));
  assert.equal(refuseBeautify(gate).allowed, false);
});

test("handwaving and pseudo-LaTeX fail", () => {
  const draft = passing();
  draft.sections[0].prose = "显然可以得到通项。";
  draft.sections[0].steps = [{ n: 1, text: "把 \\frac{1}{2} 写在句子里。" }];
  const gate = reviewContent(draft);
  assert.ok(gate.failures.some((failure) => failure.rule === "skip_step"));
  assert.ok(gate.failures.some((failure) => failure.rule === "pseudo_latex"));
});

test("a missing figure without 【图缺】 fails", () => {
  const draft = passing();
  draft.sections[0].figure = { needed: true, real: false, missingMark: false };
  const gate = reviewContent(draft);
  assert.ok(gate.failures.some((failure) => failure.rule === "missing_figure"));
});

test("a zip of placeholder pictures is not treated as slide screenshots", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "bloom-lecture-"));
  const deckPath = path.join(dir, "mini-lecture.pptx");
  await writeMiniLecture(deckPath);
  const ingest = await ingestDeck(deckPath);
  const draft = draftFromIngest(ingest);
  const overshoot = draft.sections.find((section) => section.titleZh.includes("越过最优点"));
  assert.ok(overshoot);
  assert.deepEqual(overshoot.steps.map((step) => step.n), [1, 2, 3]);
  assert.ok(overshoot.formulas.some((formula) => formula.derivation.length >= 3));
  assert.ok(overshoot.example.length > 0);
  assert.ok(overshoot.callouts.some((callout) => callout.icon === "🎯"));
  assert.equal(overshoot.figure.real, false);
  const gate = reviewContent(draft);
  assert.ok(gate.failures.some((failure) => failure.rule === "missing_figure"));
  assert.equal(refuseBeautify(gate).allowed, false);
});

test("the long text fixture still fails while its pictures are not real screenshots", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "bloom-long-"));
  const deckPath = path.join(dir, "long-lecture.pptx");
  await writeLongLecture(deckPath);
  const ingest = await ingestDeck(deckPath);
  assert.ok(ingest.slides.length >= 8);
  const draft = draftFromIngest(ingest);
  assert.ok(draft.sections.length >= 8);
  assert.ok(new Set(draft.sections.map((section) => section.chapter)).size >= 4);
  assert.ok(draft.sections.some((section) => section.formulas.some((formula) => formula.derivation.length >= 3)));
  const gate = reviewContent(draft);
  assert.ok(gate.failures.some((failure) => failure.rule === "missing_figure"));
  assert.equal(refuseBeautify(gate).allowed, false);
  assert.ok(listGaps(draft).some((gap) => gap.kind === "figure"));
});

test("a deck without a derivation lists the gap and still cannot be published", async () => {
  const draft = draftFromIngest({
    sourcePath: "bare.pptx",
    slides: [
      { number: 2, chapter: "损失", title: "定义 Definition", text: "定义：损失。\n$\\frac{1}{2}\\theta^2$", hasImage: false },
    ],
  });
  const gaps = listGaps(draft);
  assert.ok(gaps.some((gap) => gap.kind === "derivation"));
  assert.ok(gaps.some((gap) => gap.kind === "example"));
  assert.equal(reviewContent(draft).pass, false);
  let called = false;
  await assert.rejects(() =>
    publishDraft({
      draft,
      parentPageId: "a".repeat(32),
      writer: {
        createPage: async () => {
          called = true;
          return { id: "new", url: "https://example.com" };
        },
      },
    }),
  );
  assert.equal(called, false);
  assert.equal(dryRunBloom(draft).allowed, false);
});

test("a passing draft publishes the lecture shape and refuses review pages", async () => {
  const draft = passing();
  const saved: PublishBlock[][] = [];
  const result = await publishDraft({
    draft,
    parentPageId: "a".repeat(32),
    writer: {
      createPage: async ({ title, blocks }) => {
        saved.push(blocks);
        assert.match(title, /梯度下降/);
        return { id: "c".repeat(32), url: "https://example.com/test" };
      },
    },
  });
  const blocks = saved[0];
  assert.equal(blocks[0].type, "callout");
  assert.equal(blocks[1].type, "toc");
  assert.ok(blocks.some((block) => block.type === "callout" && block.emoji === "🎯"));
  assert.ok(blocks.some((block) => block.type === "equation"));
  assert.ok(blocks.some((block) => block.type === "image"));
  const missing = draftToBlocks({
    ...draft,
    sections: [{ ...draft.sections[0], figure: { needed: true, real: false, missingMark: true } }],
  });
  assert.ok(missing.some((block) => block.type === "paragraph" && block.text.includes("【图缺】")));
  assert.equal(result.bloom.allowed, true);
  assert.ok(result.bloom.ops >= 0);
  assert.throws(() => assertPublishParent("b".repeat(32), "a".repeat(32)));
  assert.throws(() => assertPublishParent("a".repeat(32), ""));
});

test("ingested slide text is a draft, not a pass to beautify", () => {
  const draft = draftFromIngest({
    sourcePath: "lecture.pdf",
    slides: [
      { number: 1, chapter: "开场", title: "Gradient descent", text: "title slide", hasImage: false },
      {
        number: 16,
        chapter: "更新",
        title: "The right direction can still overshoot",
        text: "Smooth approach. $R(\\theta)=\\frac12\\theta^2$",
        hasImage: true,
      },
    ],
  });
  const gate = reviewContent(draft);
  assert.equal(gate.pass, false);
  assert.equal(refuseBeautify(gate).allowed, false);
});

test("one chapter keeps a single illustration instead of a screenshot per slide", () => {
  const draft = draftFromIngest({
    sourcePath: "deck.pdf",
    slides: [2, 3, 4].map((number) => ({
      number,
      chapter: "网络",
      title: number === 3 ? "结构示意" : `说明 ${number}`,
      text: number === 3 ? "这一页是结构示意。" : "这一步只把定义和步骤讲清楚。",
      hasImage: true,
      imageFile: `/tmp/slide-${number}.png`,
      embedded: false,
    })),
  });
  const illustrated = draft.sections.filter((section) => section.figure.needed && section.figure.file);
  assert.equal(illustrated.length, 1);
  assert.match(illustrated[0]?.titleZh ?? "", /结构/);
  const blocks = draftToBlocks(draft);
  assert.equal(blocks.filter((block) => block.type === "image").length, 1);
});

test("without an agent draft the pipeline returns a skeleton and does not write", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "bloom-review-"));
  const deckPath = path.join(dir, "mini-lecture.pptx");
  await writeMiniLecture(deckPath);
  let called = false;
  const skeleton = await runLecturePipeline({
    deckPath,
    parentPageId: "a".repeat(32),
    review: true,
    apply: true,
    writer: {
      createPage: async () => {
        called = true;
        return { id: "c".repeat(32), url: "https://example.com/review" };
      },
    },
    client: null,
  });
  assert.equal(called, false);
  assert.equal(skeleton.role, "skeleton");
  assert.equal(skeleton.published, false);
  assert.equal(skeleton.gate.pass, false);
  assert.match(skeleton.reason ?? "", /Agent/);
});

test("an agent draft can be reviewed without bloom", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "bloom-agent-"));
  const deckPath = path.join(dir, "mini-lecture.pptx");
  await writeMiniLecture(deckPath);
  let called = false;
  const reviewed = await runLecturePipeline({
    deckPath,
    parentPageId: "a".repeat(32),
    review: true,
    apply: true,
    draft: {
      title: "待审讲解",
      roadmap: "只核对一步更新。",
      sections: [
        {
          id: "slide-2",
          chapter: "梯度下降",
          titleZh: "步长",
          prose: "这一步还没写完。",
          steps: [],
          formulas: [],
          example: "",
          callouts: [],
          unparsedMath: ["课件上的式子对不上"],
          figure: { needed: false },
        },
      ],
    },
    writer: {
      createPage: async ({ blocks }) => {
        called = true;
        assert.ok(blocks.some((block) => block.type === "callout" && block.text.includes("内容审 Fail")));
        assert.equal(blocks.filter((block) => block.type === "image").length, 0);
        return { id: "c".repeat(32), url: "https://example.com/review" };
      },
    },
    client: null,
  });
  assert.equal(called, true);
  assert.equal(reviewed.role, "draft");
  assert.equal(reviewed.published, true);
  assert.equal(reviewed.gate.pass, false);
  assert.equal(reviewed.bloom?.refused, true);
  assert.equal(reviewed.bloom?.applied, 0);
});

test("human review can write a failed draft and still cannot beautify it", async () => {
  const draft = draftFromIngest({
    sourcePath: "lecture.pdf",
    slides: [
      {
        number: 65,
        chapter: "模型",
        title: "线性模型",
        text: "Data 𝑿𝒊, 𝒀𝒊, 𝒊= 𝟏, … , 𝒏.",
        hasImage: false,
      },
    ],
  });
  assert.equal(reviewContent(draft).pass, false);
  const blocks = humanReviewBlocks(draft);
  assert.equal(blocks[0]?.type, "callout");
  if (blocks[0]?.type === "callout") {
    assert.match(blocks[0].text, /内容审 Fail/);
    assert.match(blocks[0].text, /未美化/);
  }
  assert.ok(blocks.some((block) => block.type === "paragraph" && block.text.includes("【公式缺/待补】")));
  assert.equal(blocks.some((block) => block.type === "equation"), false);
  const broken = passing();
  broken.sections[0].formulas[0].expression = "\\frac{";
  const rendered = draftToBlocks(broken);
  assert.ok(rendered.some((block) => block.type === "paragraph" && block.text.includes("【公式缺/待补】")));
  assert.equal(rendered.some((block) => block.type === "equation"), false);
  let called = false;
  const result = await publishDraft({
    draft,
    parentPageId: "a".repeat(32),
    humanReview: true,
    writer: {
      createPage: async ({ blocks: written }) => {
        called = true;
        assert.ok(written.some((block) => block.type === "callout" && block.text.includes("内容审 Fail")));
        assert.equal(written.some((block) => block.type === "equation"), false);
        return { id: "c".repeat(32), url: "https://example.com/review" };
      },
    },
  });
  assert.equal(called, true);
  assert.equal(result.bloom.allowed, false);
  assert.equal(result.bloom.ops, 0);
  const previousDeny = process.env.NOTION_BLOOM_DENY;
  process.env.NOTION_BLOOM_DENY = `${"b".repeat(32)},${"d".repeat(32)}`;
  try {
    assert.throws(() => assertPublishParent("b".repeat(32), "b".repeat(32)), /NOTION_BLOOM_DENY/);
    assert.throws(() => assertPublishParent("d".repeat(32), "a".repeat(32)), /NOTION_BLOOM_DENY/);
  } finally {
    if (previousDeny === undefined) delete process.env.NOTION_BLOOM_DENY;
    else process.env.NOTION_BLOOM_DENY = previousDeny;
  }
  const replaced = blocksAfterUpload([{ type: "image", file: "/tmp/slide.png", caption: "第 2 页" }], new Set(["/tmp/slide.png"]));
  assert.equal(replaced[0]?.type, "paragraph");
  if (replaced[0]?.type === "paragraph") assert.match(replaced[0].text, /【图缺】/);
  await assert.rejects(
    () => applyBloomIfSafe({} as never, "c".repeat(32), "a".repeat(32), false),
    /内容未过关就美化 = Fail/,
  );
  const bloomDeny = process.env.NOTION_BLOOM_DENY;
  process.env.NOTION_BLOOM_DENY = "e".repeat(32);
  try {
    await assert.rejects(
      () => applyBloomIfSafe({} as never, "e".repeat(32), "a".repeat(32), true),
      /NOTION_BLOOM_DENY/,
    );
  } finally {
    if (bloomDeny === undefined) delete process.env.NOTION_BLOOM_DENY;
    else process.env.NOTION_BLOOM_DENY = bloomDeny;
  }
});
