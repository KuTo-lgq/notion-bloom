/**
 * Twelve slides of one short lesson, dense enough to stand in for a real lecture.
 * Every complex formula is preceded by 推导 lines that already appear here.
 * Nothing is added at generate time.
 */

import { writeFile } from "node:fs/promises";

import JSZip from "jszip";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const SLIDES: Array<{ lines: string[]; image?: boolean }> = [
  { lines: ["一步梯度", "本讲把一次更新写完，不跳步。"] },
  {
    lines: [
      "问题",
      "三个问题 Three questions",
      "1. 先问参数怎么移动。",
      "2. 再问哪一种误差被惩罚。",
      "3. 最后问这个损失在估计什么。",
      "例如：预测房价时，走法是梯度，罚的是平方误差，估计的是条件均值。",
      "考点：优化器只决定怎么走，损失决定学什么。",
    ],
  },
  {
    image: true,
    lines: [
      "损失",
      "平方损失 Squared loss",
      "1. 用预测减去真值，得到残差。",
      "2. 把残差平方。",
      "3. 乘上二分之一，后面求导时系数会消掉。",
      "推导：残差记为 r。",
      "推导：平方是 r 的平方。",
      "推导：前面的二分之一是为了让导数里不再出现这个 2。",
      "$\\frac{1}{2}r^{2}$",
      "定义：平方损失是残差平方再乘二分之一。",
      "例如：残差是 2 时，损失是 2，不是 4。",
    ],
  },
  {
    lines: [
      "损失",
      "梯度就是变量 Gradient is the variable",
      "1. 把损失写成变量平方的一半。",
      "2. 对变量求导，二分之一和 2 相乘得 1。",
      "3. 导数只剩下变量自己。",
      "推导：损失是变量平方除以 2。",
      "推导：对变量求导时，平方的 2 与前面的二分之一抵消。",
      "推导：剩下的就是变量本身。",
      "$\\nabla R=\\theta$",
      "考点：在这个例子里，梯度不是一个新符号，就是当前位置。",
      "例如：变量等于 4 时，梯度也是 4，要往减小它的方向走。",
    ],
  },
  {
    image: true,
    lines: [
      "更新",
      "减去步长乘梯度 One update",
      "1. 沿梯度的反方向才是下降。",
      "2. 步长决定这一步走多远。",
      "3. 从当前点减去步长乘梯度。",
      "推导：下降方向是梯度取负。",
      "推导：走多远等于步长乘这个方向的长度。",
      "推导：新的点等于旧点加上这一段位移。",
      "$\\theta_{t+1}=\\theta_t-\\alpha\\theta_t$",
      "例如：当前是 4、步长是 0.5 时，下一步是 4 减去 2，等于 2。",
      "注意：步长越大，同一次更新挪得越远。",
    ],
  },
  {
    lines: [
      "更新",
      "合并成一个倍数 Factor the step",
      "1. 两项都含有当前点。",
      "2. 提出这个公因子。",
      "3. 括号里剩下 1 减去步长。",
      "推导：右端是当前点乘 1，再减去当前点乘步长。",
      "推导：提出当前点。",
      "推导：系数就是 1 减步长。",
      "$\\theta_{t+1}=(1-\\alpha)\\theta_t$",
      "考点：这个倍数的绝对值大于 1，点会越走越远。",
      "例如：步长 1.5 时倍数是 -0.5，换号但更靠近 0。",
    ],
  },
  {
    lines: [
      "随机",
      "只用一个样本 One example",
      "1. 全量梯度要看每一个样本。",
      "2. 随机梯度只抽一个残差。",
      "3. 用这个样本自己的梯度代替全量。",
      "推导：单个样本的目标仍是它自己的平方损失。",
      "推导：对它求导得到该样本的梯度。",
      "推导：这一步就用这个梯度，不先把其余样本加进来。",
      "$g=\\theta-a$",
      "定义：a 是抽到的那个样本的位置。",
      "例如：变量是 0、抽到的点是 1 时，这个梯度是 -1，会把变量往 1 拉。",
    ],
  },
  {
    lines: [
      "随机",
      "小批量再平均 Mini-batch",
      "1. 一次抽 B 个样本。",
      "2. 每个样本先算自己的梯度。",
      "3. 把这 B 个梯度加起来再除以 B。",
      "推导：先保留每一个样本梯度。",
      "推导：求和得到这一批的总推力。",
      "推导：除以 B 才是平均，不会因为批更大而步子自动变大。",
      "$g_t=\\frac{1}{B}\\sum_{j=1}^{B}g_j$",
      "考点：忘了除以 B，等效步长会跟着批大小一起变。",
      "例如：两个梯度是 2 和 4 时，平均是 3，不是 6。",
    ],
  },
  {
    lines: [
      "无偏",
      "平均起来才等于全量 Unbiased",
      "1. 每个样本被抽到的机会相同。",
      "2. 所以单个梯度的期望等于全体平均。",
      "3. 某一次抽到的梯度仍可以指错方向。",
      "推导：等概率下，期望是全体样本梯度的平均。",
      "推导：全体平均就是全量梯度。",
      "推导：期望相等并不表示每一次都相等。",
      "$\\mathbb{E}[g]=\\nabla R$",
      "例如：两个梯度是 3 和 -3，期望是 0，但抽到任一个都会移动。",
      "注意：无偏不是说这一步的损失一定下降。",
    ],
  },
  {
    lines: [
      "配图",
      "曲线见下图 Learning curve",
      "【图缺】",
      "1. 先看训练损失是否下降。",
      "2. 再看验证损失是否跟着降。",
      "3. 两边分叉时先停，不要先改模型。",
      "定义：学习曲线是损失随步数的图。",
      "例如：训练一直降、验证转升，是记了噪声，不是步长太小。",
    ],
  },
  {
    lines: [
      "收束",
      "两句话收束 Two choices",
      "1. 写下更新，这是优化器做的事。",
      "2. 写下损失，这是估计目标。",
      "3. 两句都在，这一讲才算写完。",
      "考点：只写梯度下降、不写损失，别人不知道你在估计什么。",
      "例如：同样用梯度下降，平方损失估计均值，绝对值损失估计中位数。",
    ],
  },
  {
    lines: [
      "收束",
      "用手算核对 Check one step",
      "1. 取当前点 2，步长 1。",
      "2. 梯度等于当前点，所以是 2。",
      "3. 下一步等于 2 减去 1 乘 2。",
      "推导：梯度就是当前点 2。",
      "推导：位移是步长 1 乘梯度 2。",
      "推导：2 减去 2 得到 0。",
      "$\\theta_{1}=2-1\\cdot 2$",
      "例如：算完停在 0，因为这一点的梯度也是 0。",
    ],
  },
];

export async function longLecturePptx(): Promise<Uint8Array> {
  const zip = new JSZip();
  SLIDES.forEach((slide, index) => {
    const n = index + 1;
    const texts = slide.lines.map((line) => `<a:t>${line}</a:t>`).join("");
    const blip = slide.image ? `<p:pic><p:blipFill><a:blip r:embed="rId2"/></p:blipFill></p:pic>` : "";
    zip.file(`ppt/slides/slide${n}.xml`, `<?xml version="1.0"?><p:sld>${texts}${blip}</p:sld>`);
    const imageRel = slide.image
      ? `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${n}.png"/>`
      : "";
    zip.file(`ppt/slides/_rels/slide${n}.xml.rels`, `<?xml version="1.0"?><Relationships>${imageRel}</Relationships>`);
    if (slide.image) zip.file(`ppt/media/image${n}.png`, PNG);
  });
  return zip.generateAsync({ type: "uint8array" });
}

export async function writeLongLecture(filePath: string): Promise<void> {
  await writeFile(filePath, await longLecturePptx());
}
