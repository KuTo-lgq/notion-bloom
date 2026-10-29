/**
 * Composition rules.
 *
 * The first set of rules mostly repairs damage: a missing icon, a skipped
 * heading level, a colour from outside the palette. A page can pass all of
 * that and still read as an unformatted dump. These rules build the things a
 * person actually sees: a lede, section titles, emphasis, and a row of columns
 * where the page is listing peers rather than arguing in sequence.
 *
 * Text is preserved verbatim. A paragraph split at a full stop still contains
 * every character it started with.
 */

import type { Op } from "./ops";
import { opId } from "./ops";
import type { Finding, Rule } from "./rules";
import { isHeading, plainText, polishInline, sentences, splitBySentences, splitLede, topicHeading, visualLength, walk } from "./text";
import type { CalloutIntent, NotionColor, PolishBlock, RichText } from "./types";

function excerpt(block: PolishBlock, max = 32): string {
  const text = plainText(block.richText).trim();
  if (!text) return `<${block.type}>`;
  return visualLength(text) > max ? `${[...text].slice(0, max).join("")}…` : text;
}

function plainRuns(runs: RichText[] | undefined): boolean {
  return (runs ?? []).every((run) => !run.bold && !run.italic && !run.code && !run.href && !run.color);
}

function textBlock(id: string, text: string, source: RichText[] | undefined): PolishBlock {
  const template = source?.length === 1 ? source[0] : undefined;
  return {
    id,
    type: "paragraph",
    richText: [template ? { ...template, text } : { text }],
  };
}

const headingColorRule: Rule = {
  id: "heading-color-off-theme",
  title: "标题没有用主题色",
  dimension: "consistency",
  rationale:
    "主题为每一级标题规定了颜色。二级标题带上主题色之后，长页面在滚动时才有节奏，而不是一整页同样的黑字。",
  check: ({ page, theme }) => {
    const findings: Finding[] = [];
    for (const { block } of walk(page.blocks)) {
      if (!isHeading(block)) continue;
      const wanted = theme.headingColors[block.type as keyof typeof theme.headingColors];
      if (!wanted || wanted === "default" || block.color === wanted) continue;
      findings.push({
        ruleId: "heading-color-off-theme",
        title: "标题没有用主题色",
        dimension: "consistency",
        severity: "low",
        message: `「${excerpt(block)}」是 ${block.type}，主题色是 ${wanted}，当前是 ${block.color ?? "default"}。`,
        suggestion: `改为 ${wanted}。`,
        blockId: block.id,
        excerpt: excerpt(block),
        ops: [
          {
            id: opId(["set_block_color", block.id, wanted]),
            kind: "set_block_color",
            dimension: "consistency",
            reason: `${block.type} 套用主题色 ${wanted}`,
            destructive: false,
            blockId: block.id,
            color: wanted,
            previousColor: block.color,
          },
        ],
      });
    }
    return findings;
  },
};

const inlineEmphasisRule: Rule = {
  id: "inline-emphasis-missing",
  title: "标签和数字没有强调",
  dimension: "rhythm",
  rationale:
    "「注意：」这类标签，以及带百分号或单位的数字，是读者扫视时的落点。把它们加粗不改一个字，页面立刻有了排版而不是纯文本。",
  check: ({ page }) => {
    const findings: Finding[] = [];
    for (const { block } of walk(page.blocks)) {
      if (block.type !== "paragraph" && block.type !== "bulleted_list_item" && block.type !== "numbered_list_item" && block.type !== "callout") {
        continue;
      }
      const polished = polishInline(block.richText ?? []);
      if (!polished) continue;
      findings.push({
        ruleId: "inline-emphasis-missing",
        title: "标签和数字没有强调",
        dimension: "rhythm",
        severity: "low",
        message: `「${excerpt(block)}」里的标签或数字和正文一样重。`,
        suggestion: "标签加粗，百分数和带单位的数字加粗。",
        blockId: block.id,
        excerpt: excerpt(block),
        ops: [
          {
            id: opId(["set_rich_text", block.id, "emphasis"]),
            kind: "set_rich_text",
            dimension: "rhythm",
            reason: "加粗标签和关键数字",
            destructive: false,
            blockId: block.id,
            richText: polished,
          },
        ],
      });
    }
    return findings;
  },
};

const ledeRule: Rule = {
  id: "lede-not-lifted",
  title: "开头没有导语",
  dimension: "rhythm",
  rationale:
    "长文档的第一句通常是这页在讲什么。把它提出来做成提示框，读者不用读完整段就能决定要不要往下看。其余句子原样留在下面。",
  check: ({ page, theme }) => {
    // Only the block that opens the page. Once a lede exists, the first block
    // is that callout and this stops, instead of peeling off a sentence per pass.
    const first = page.blocks[0];
    if (first?.type !== "paragraph" || !first.richText || !plainRuns(first.richText)) return [];
    const text = plainText(first.richText);
    const split = splitLede(text);
    if (!split) return [];
    if (topicHeading(text)) return [];
    const style = theme.callouts.info;
    const ledeId = `new-lede-${first.id}`;
    const restId = `new-lede-rest-${first.id}`;
    return [
      {
        ruleId: "lede-not-lifted",
        title: "开头没有导语",
        dimension: "rhythm",
        severity: "medium",
        message: `开篇「${excerpt(first)}」把导语和正文写在同一段里。`,
        suggestion: `第一句提成 ${style.emoji} 导语，后面的句子留在段落里。`,
        blockId: first.id,
        excerpt: excerpt(first, 60),
        ops: [
          {
            id: opId(["replace_block", first.id, "lede"]),
            kind: "replace_block",
            dimension: "rhythm",
            reason: "开篇第一句提成导语",
            destructive: false,
            recreates: true,
            blockId: first.id,
            blocks: [
              {
                id: ledeId,
                type: "callout",
                richText: [{ text: split.lede }],
                icon: { type: "emoji", emoji: style.emoji },
                color: style.color,
              },
              textBlock(restId, split.rest, first.richText),
            ],
          },
        ],
      },
    ];
  },
};

const topicHeadingRule: Rule = {
  id: "topic-heading-missing",
  title: "段落开头就是章节名，但没有标题",
  dimension: "hierarchy",
  rationale:
    "读书笔记和会议记录经常整页没有标题，但段落第一句已经说出了这一节的名字。「锚定效应这一章……」上面就应该有一个标题，否则目录和折叠都无从谈起。工具只在整页几乎没有标题时做这件事，避免在已经分好章的文档里再插一层。",
  check: ({ page, theme }) => {
    const headings = page.blocks.filter((block) => isHeading(block));
    if (headings.length >= 2) return [];
    const findings: Finding[] = [];
    for (const { block, siblings, index } of walk(page.blocks)) {
      if (block.type !== "paragraph") continue;
      if (!plainRuns(block.richText)) continue;
      const text = plainText(block.richText);
      if (visualLength(text) < 80) continue;
      const title = topicHeading(text);
      if (!title) continue;
      const previous = index > 0 ? siblings[index - 1] : undefined;
      if (previous && isHeading(previous) && plainText(previous.richText).trim() === title) continue;
      const heading: PolishBlock = {
        id: `new-topic-${block.id}`,
        type: "heading_2",
        richText: [{ text: title }],
      };
      const color = theme.headingColors.heading_2;
      if (color !== "default") heading.color = color;
      findings.push({
        ruleId: "topic-heading-missing",
        title: "段落开头就是章节名，但没有标题",
        dimension: "hierarchy",
        severity: "high",
        message: `「${excerpt(block)}」开头就是「${title}」，这一节没有标题。`,
        suggestion: `在它前面插入二级标题「${title}」。`,
        blockId: block.id,
        excerpt: excerpt(block, 40),
        ops: [
          {
            id: opId(["insert_block", "topic", block.id]),
            kind: "insert_block",
            dimension: "hierarchy",
            reason: `插入章节标题「${title}」`,
            destructive: false,
            after: previous ? previous.id : null,
            block: heading,
          },
        ],
      });
    }
    return findings;
  },
};

const paragraphSplitRule: Rule = {
  id: "paragraph-not-split",
  title: "长段落可以按句子断开",
  dimension: "rhythm",
  rationale:
    "超过主题长度的段落，如果本身就是好几句话，按句号拆开并不改写内容，只是把本来就存在的停顿变成段落。拆完每段仍然是完整的句子。",
  check: ({ page, theme }) => {
    const findings: Finding[] = [];
    for (const { block } of walk(page.blocks)) {
      if (block.type !== "paragraph" || !plainRuns(block.richText)) continue;
      const text = plainText(block.richText);
      if (block.id === page.blocks[0]?.id && splitLede(text)) continue;
      const groups = splitBySentences(text, theme.structure.maxParagraphChars);
      if (!groups) continue;
      findings.push({
        ruleId: "paragraph-not-split",
        title: "长段落可以按句子断开",
        dimension: "rhythm",
        severity: "medium",
        message: `「${excerpt(block)}」有 ${sentences(text).length} 句话挤在一段里，视觉宽度约 ${visualLength(text)}。`,
        suggestion: `按句号拆成 ${groups.length} 段，一个字不改。`,
        blockId: block.id,
        excerpt: excerpt(block, 40),
        ops: [
          {
            id: opId(["replace_block", block.id, "split"]),
            kind: "replace_block",
            dimension: "rhythm",
            reason: `按句子拆成 ${groups.length} 段`,
            destructive: false,
            recreates: true,
            blockId: block.id,
            blocks: groups.map((group, index) => textBlock(`new-split-${block.id}-${index}`, group, block.richText)),
          },
        ],
      });
    }
    return findings;
  },
};

function intentFromColor(color: NotionColor | undefined): CalloutIntent {
  if (color === "red_background" || color === "yellow_background" || color === "orange_background") return "warning";
  if (color === "green_background") return "success";
  if (color === "purple_background" || color === "pink_background") return "key";
  return "info";
}

const highlightedSentenceRule: Rule = {
  id: "highlight-not-callout",
  title: "作者涂了色的短句还是普通段落",
  dimension: "rhythm",
  rationale:
    "给一整段铺底色，是还没有提示框时的标记方式。短的那几段通常就是作者想让人停下来的话，收成带图标的提示框之后，颜色才代表一种语气，而不是一块色斑。长段即使涂了色也保持段落，避免一页全是提示框。",
  check: ({ page, theme }) => {
    const candidates = page.blocks.filter((block) => {
      if (block.type !== "paragraph") return false;
      if (!block.color?.endsWith("_background")) return false;
      const text = plainText(block.richText);
      const length = visualLength(text);
      // A coloured explanation of several sentences is still a paragraph.
      // Only a short marked line should become a callout.
      return length >= 16 && length <= 160 && sentences(text).length <= 2;
    });
    return candidates.slice(0, 2).map((block) => {
      const intent = intentFromColor(block.color);
      const style = theme.callouts[intent];
      return {
        ruleId: "highlight-not-callout",
        title: "作者涂了色的短句还是普通段落",
        dimension: "rhythm" as const,
        severity: "medium" as const,
        message: `「${excerpt(block)}」被铺了 ${block.color}，但仍然是普通段落。`,
        suggestion: `收成 ${style.emoji} 提示框。`,
        blockId: block.id,
        excerpt: excerpt(block, 60),
        ops: [
          {
            id: opId(["convert_block", block.id, "callout", intent]),
            kind: "convert_block" as const,
            dimension: "rhythm" as const,
            reason: `涂色短句收成 ${style.emoji} 提示框`,
            destructive: false,
            recreates: true,
            blockId: block.id,
            to: "callout" as const,
            intent,
            icon: { type: "emoji" as const, emoji: style.emoji },
            color: style.color,
          },
        ],
      };
    });
  },
};

const columnRule: Rule = {
  id: "short-run-not-columnized",
  title: "并列的短句还在纵向堆着",
  dimension: "rhythm",
  rationale:
    "周报里「三件进展」这种彼此独立、每句都很短的内容，横着排比竖着排更容易一眼看完。只在主题明确允许、而且每句都短到放得进一栏时才这么做。",
  check: ({ page, theme }) => {
    if (!theme.structure.columnizeShortRuns) return [];
    const findings: Finding[] = [];
    const scan = (blocks: PolishBlock[]) => {
      let run: PolishBlock[] = [];
      const flush = () => {
        if (run.length >= 3 && run.length <= 4) {
          const ids = run.map((block) => block.id);
          findings.push({
            ruleId: "short-run-not-columnized",
            title: "并列的短句还在纵向堆着",
            dimension: "rhythm",
            severity: "medium",
            message: `从「${excerpt(run[0], 20)}」起有 ${run.length} 句并列的短内容，竖排浪费了横向空间。`,
            suggestion: "排成等宽的横栏。",
            blockId: run[0].id,
            ops: [
              {
                id: opId(["wrap_in_columns", ...ids]),
                kind: "wrap_in_columns",
                dimension: "rhythm",
                reason: `${run.length} 句并列短内容排成横栏`,
                destructive: false,
                recreates: true,
                blockId: ids[0],
                blockIds: ids,
                columnListId: `new-cols-${ids[0]}`,
              },
            ],
          });
        }
        run = [];
      };
      for (const block of blocks) {
        const text = plainText(block.richText);
        const short =
          block.type === "paragraph" &&
          !block.children?.length &&
          // A full sentence wrapped into a third of the page just breaks mid-phrase.
          // Columns are for labels and figures, not for paragraphs.
          visualLength(text) >= 8 &&
          visualLength(text) <= 48 &&
          sentences(text).length <= 1;
        if (short) run.push(block);
        else flush();
      }
      flush();
    };
    scan(page.blocks);
    return findings;
  },
};

export const COMPOSE_RULES: Rule[] = [
  headingColorRule,
  inlineEmphasisRule,
  ledeRule,
  topicHeadingRule,
  paragraphSplitRule,
  highlightedSentenceRule,
  columnRule,
];
