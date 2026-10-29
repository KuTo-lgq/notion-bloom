/**
 * The design spec, generated from the themes and rules rather than maintained
 * as a second copy of them. An agent can follow this document on its own,
 * with any Notion client; the code exists for the parts a document cannot do:
 * seeing the page, counting across it, and rolling a change back.
 */

import { PPT_AGENT_NOTE } from "@/ppt/place";

import { RULES } from "./rules";
import { THEMES } from "./themes";
import { DIMENSION_LABELS, SCORE_DIMENSIONS } from "./types";

export function designSpec(): string {
  const dimensions = SCORE_DIMENSIONS.map(
    (id) => `- **${DIMENSION_LABELS[id].zh}**（${DIMENSION_LABELS[id].en}）：${DIMENSION_LABELS[id].blurb}`,
  ).join("\n");

  const themes = THEMES.map((theme) => {
    const callouts = Object.entries(theme.callouts)
      .map(([intent, style]) => `${style.emoji} ${intent}（${style.color}）`)
      .join("、");
    return [
      `### ${theme.name}（${theme.nameEn}，id: \`${theme.id}\`）`,
      theme.description,
      `适合：${theme.bestFor}`,
      `调色板：${theme.palette.join("、")}`,
      `callout 语义：${callouts}`,
      ...theme.principles.map((line) => `- ${line}`),
    ].join("\n");
  }).join("\n\n");

  const rules = RULES.map(
    (rule) =>
      `- \`${rule.id}\`（${DIMENSION_LABELS[rule.dimension].zh}）${rule.title}。${rule.rationale}`,
  ).join("\n");

  return `# Notion 页面排版规范

美化是流水线的最后一步。跳步 = Fail。无推导的复杂公式 = Fail。内容未过关就美化 = Fail。

这份规范描述的是 Notion 公开 API 能真正改到的那一层。字体、字号、行距、数据库视图版式都不在其中，不要在这些上面花力气。

页面观感的提升几乎都来自六件事：图标、封面、标题层级、callout 的节奏、分隔线留白、统一配色。六件都在 API 能力范围内。

## 评分维度

${dimensions}

## 工作方式

1. 先审计，读分数和问题清单，不要上来就改。
2. 让工具出计划。计划里的操作分三类：可直接执行的、被扣下的破坏性操作、需要你自己判断的候选项。
3. 看渲染图，不要凭想象判断好不好看。
4. 确认分数会上涨、破坏性操作符合预期之后，再写回页面。
5. 保存返回的快照。回滚是按快照重建，块 id 会变，行内评论和 \`#block\` 深链会丢失。

类型转换（段落变 callout、标题改级别）在 API 层只能删除后重建，同样会更换块 id。页面上有重要评论时，把 \`allowRecreate\` 设为 false。

## 主题

${themes}

## 规则

${rules}

## 克制

- 同一页的背景色不超过主题上限，颜色是在分类，不是在装饰。
- callout 宁少勿多。一页三个以上，重点就不再是重点。
- 不删除作者写的内容，除非对方明确要求。空行和加粗属于这一类。
- 不替作者发明章节标题。工具只会指出「这里缺标题」。

## 课件配图

${PPT_AGENT_NOTE}

一页最多配 6 张，每张幻灯片只取第一张图。配不上章节标题的图不插。打不开课件时工具返回跳过，讲解照常写完、排好。
`;
}
