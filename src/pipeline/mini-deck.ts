/**
 * A three-slide deck used to prove ingest → generate → content gate.
 * The words are the lecture, not a dump of slide chrome.
 */

import { writeFile } from "node:fs/promises";

import JSZip from "jszip";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const SLIDES = [
  ["梯度下降", "本讲只讲一步更新会不会走过头。"],
  [
    "梯度下降",
    "步长太大会越过最优点 Overshoot",
    "1. 写出二次损失，它的梯度就是变量自己。",
    "2. 用更新式减去步长乘梯度。",
    "3. 把两项里的变量合并，得到下一步与这一步的倍数。",
    "推导：损失对变量的导数就是变量本身。",
    "推导：下一步等于这一步减去步长乘这一步。",
    "推导：提出公因子后，倍数是 1 减去步长。",
    "$\\frac{1}{2}\\theta^{2}$",
    "$\\theta_{t+1}=(1-\\alpha)\\theta_t$",
    "例如：步长取 1.5 时，倍数是 -0.5，每一步换号，但离原点更近。",
    "考点：倍数的绝对值大于 1 就会发散。",
  ],
  ["梯度下降", "曲线见下图", "【图缺】", "定义：步长是沿梯度走多远。", "例如：步长 0 表示停在原地。"],
];

export async function miniLecturePptx(): Promise<Uint8Array> {
  const zip = new JSZip();
  SLIDES.forEach((lines, index) => {
    const n = index + 1;
    const texts = lines.map((line) => `<a:t>${line}</a:t>`).join("");
    const picture = n === 2;
    const blip = picture ? `<p:pic><p:blipFill><a:blip r:embed="rId2"/></p:blipFill></p:pic>` : "";
    zip.file(`ppt/slides/slide${n}.xml`, `<?xml version="1.0"?><p:sld>${texts}${blip}</p:sld>`);
    const imageRel = picture
      ? `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${n}.png"/>`
      : "";
    zip.file(`ppt/slides/_rels/slide${n}.xml.rels`, `<?xml version="1.0"?><Relationships>${imageRel}</Relationships>`);
    if (picture) zip.file(`ppt/media/image${n}.png`, PNG);
  });
  return zip.generateAsync({ type: "uint8array" });
}

export async function writeMiniLecture(filePath: string): Promise<void> {
  await writeFile(filePath, await miniLecturePptx());
}
