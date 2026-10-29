import assert from "node:assert/strict";
import { test } from "node:test";

import JSZip from "jszip";

import { audit } from "@/core/audit";
import { applyOpsToPage, proposePlan } from "@/core/planner";
import { getSample } from "@/core/samples";
import { extractPptx } from "@/ppt/extract";
import { auditFigures, isImportantFigure, placePptFigures } from "@/ppt/place";
import type { PolishPage } from "@/core/types";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function pptx(slides: Array<{ text: string; image?: boolean }>): Promise<Uint8Array> {
  const zip = new JSZip();
  slides.forEach((slide, index) => {
    const n = index + 1;
    const blip = slide.image ? `<p:pic><p:blipFill><a:blip r:embed="rId2"/></p:blipFill></p:pic>` : "";
    zip.file(
      `ppt/slides/slide${n}.xml`,
      `<?xml version="1.0"?><p:sld><a:t>${slide.text}</a:t>${blip}</p:sld>`,
    );
    const imageRel = slide.image
      ? `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${n}.png"/>`
      : "";
    zip.file(`ppt/slides/_rels/slide${n}.xml.rels`, `<?xml version="1.0"?><Relationships>${imageRel}</Relationships>`);
    if (slide.image) zip.file(`ppt/media/image${n}.png`, PNG);
  });
  return zip.generateAsync({ type: "uint8array" });
}

const lecture = (): PolishPage => ({
  id: "lec",
  title: "贝叶斯定理课堂笔记",
  blocks: [
    { id: "h-formula", type: "heading_2", richText: [{ text: "公式" }] },
    { id: "p-formula", type: "paragraph", richText: [{ text: "后验等于似然乘先验，再除以证据。" }] },
    { id: "h-test", type: "heading_2", richText: [{ text: "发病检测" }] },
    { id: "p-test", type: "paragraph", richText: [{ text: "如图，阳性之后的后验大约是 17%。" }] },
    { id: "h-mark", type: "heading_2", richText: [{ text: "另算" }] },
    { id: "p-mark", type: "paragraph", richText: [{ text: "这张图还没画。【图缺】" }] },
  ],
});

test("a slide image is placed under the heading it names", async () => {
  const slides = await extractPptx(
    await pptx([
      { text: "公式", image: true },
      { text: "发病检测", image: true },
    ]),
  );
  assert.equal(slides.length, 2);
  assert.equal(slides[0].images.length, 1);
  const placed = placePptFigures(lecture(), slides);
  assert.deepEqual(
    placed.placements.map((item) => item.heading).sort(),
    ["公式", "发病检测"].sort(),
  );
  const ids = placed.page.blocks.map((block) => block.id);
  const formulaAt = ids.indexOf("h-formula");
  assert.equal(placed.page.blocks[formulaAt + 1].type, "image");
  assert.match(placed.page.blocks[formulaAt + 1].url ?? "", /^data:image\/png/);
});

test("a matching slide with no image is a missing figure, unless the page says 【图缺】", async () => {
  const slides = await extractPptx(
    await pptx([
      { text: "公式", image: false },
      { text: "另算", image: false },
    ]),
  );
  const findings = auditFigures(lecture(), slides);
  assert.ok(findings.some((finding) => finding.heading === "公式"));
  assert.equal(
    findings.some((finding) => finding.heading === "另算"),
    false,
  );
  assert.ok(findings.some((finding) => finding.heading === "发病检测" && finding.message.includes("如图")));
});

test("contents, title, and thanks slides are not placed; at most six important figures are", async () => {
  const names = ["目录", "公式", "定理", "定义", "算法", "曲线", "梯度", "考点", "谢谢"];
  const page: PolishPage = {
    id: "cap",
    title: "讲义",
    blocks: names.map((name, index) => ({
      id: `h-${index}`,
      type: "heading_2" as const,
      richText: [{ text: name }],
    })),
  };
  const slides = await extractPptx(await pptx(names.map((text) => ({ text, image: true }))));
  const placed = placePptFigures(page, slides);
  const headings = placed.placements.map((item) => item.heading);
  assert.equal(placed.placements.length, 6);
  assert.equal(headings.includes("目录"), false);
  assert.equal(headings.includes("谢谢"), false);
  assert.equal(headings.includes("公式"), true);
  assert.equal(placed.placements.every((item) => item.imageCount === 1), true);
  assert.equal(isImportantFigure("封面", "本讲标题"), false);
  assert.equal(isImportantFigure("损失函数", "训练曲线", ""), true);
});

test("a contents slide with no picture is not a missing figure", async () => {
  const slides = await extractPptx(
    await pptx([
      { text: "目录", image: false },
      { text: "公式", image: false },
    ]),
  );
  const findings = auditFigures(lecture(), slides);
  assert.equal(
    findings.some((finding) => finding.heading === "目录"),
    false,
  );
  assert.ok(findings.some((finding) => finding.heading === "公式"));
});

test("the Bayes sample can take the deck without changing the lecture's words", async () => {
  const page = getSample("sample-bayes-lecture");
  assert.ok(page);
  const beautified = applyOpsToPage(page, proposePlan(page, { themeId: "clean-docs" }).ops);
  const slides = await extractPptx(
    await pptx([
      { text: "公式", image: true },
      { text: "发病检测", image: true },
      { text: "常见错误", image: true },
    ]),
  );
  const placed = placePptFigures(beautified, slides);
  assert.equal(placed.placements.length, 3);
  assert.equal(audit(beautified, "clean-docs").overall >= audit(page, "clean-docs").overall, true);
});
