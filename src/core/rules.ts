/**
 * Audit rules.
 *
 * Each rule answers one narrow question about a page and, where a fix is
 * unambiguous, emits the ops that would fix it. Rules that would have to guess
 * at the author's meaning emit a finding without ops, or a candidate for the
 * calling agent to decide on — the toolkit never silently rewrites prose.
 *
 * Every rule is idempotent: it checks for the fix before proposing it, so
 * running the planner twice never stacks two tables of contents.
 */

import { COMPOSE_RULES } from "./compose-rules";
import type { Candidate, Op } from "./ops";
import { opId } from "./ops";
import { getTheme, isInPalette, snapToPalette, type Theme } from "./themes";
import {
  boldRatio,
  calloutEmojis,
  detectInlineList,
  detectIntent,
  detectLanguage,
  flatten,
  headingLevel,
  isEmptyBlock,
  plainText,
  shortHash,
  suggestPageIcon,
  visualLength,
  walk,
  type HeadingLevel,
} from "./text";
import type {
  CalloutIntent,
  NotionBackgroundColor,
  PolishBlock,
  PolishPage,
  ScoreDimension,
  Severity,
} from "./types";

export type Finding = {
  ruleId: string;
  title: string;
  dimension: ScoreDimension;
  severity: Severity;
  /** What is wrong, phrased concretely enough to act on. */
  message: string;
  /** What to do about it. */
  suggestion: string;
  blockId?: string;
  /** Short excerpt of the offending block, so an agent needn't refetch. */
  excerpt?: string;
  ops: Op[];
  candidates?: Candidate[];
};

export type RuleContext = {
  page: PolishPage;
  theme: Theme;
};

export type Rule = {
  id: string;
  title: string;
  dimension: ScoreDimension;
  /** Why this rule exists, shown in the design spec. */
  rationale: string;
  check: (ctx: RuleContext) => Finding[];
};

function excerpt(block: PolishBlock, max = 48): string {
  const text = plainText(block.richText).trim();
  if (!text) return `<${block.type}>`;
  return visualLength(text) > max ? `${[...text].slice(0, max).join("")}…` : text;
}

function newBlockId(kind: string, seed: string): string {
  return `new-${kind}-${shortHash(seed)}`;
}

function intentFor(block: PolishBlock): CalloutIntent {
  return detectIntent(plainText(block.richText)) ?? "info";
}

/**
 * How much page there is to read, measured in visual character width.
 *
 * Block count is a bad proxy: nine 250-character paragraphs are a far longer
 * page than thirty short list items, but they only count as nine blocks. This
 * is why the first version of these rules let a wall-of-text reading log
 * through without flagging the missing structure.
 */
function contentVolume(page: PolishPage): number {
  return flatten(page.blocks).reduce((sum, b) => sum + visualLength(plainText(b.richText)), 0);
}

/** Roughly two screens of reading on a default-width Notion page. */
const LONG_PAGE_VOLUME = 1100;

// ---------------------------------------------------------------- identity

const pageIconRule: Rule = {
  id: "page-icon-missing",
  title: "页面没有图标",
  dimension: "identity",
  rationale:
    "图标是页面在侧边栏、搜索结果、链接预览里唯一的视觉标识。没有图标的页面在一列文档中完全无法被扫视辨认，这是性价比最高的一处改动。",
  check: ({ page, theme }) => {
    if (page.icon) return [];
    const emoji = suggestPageIcon(page.title, theme.fallbackIcon);
    return [
      {
        ruleId: "page-icon-missing",
        title: "页面没有图标",
        dimension: "identity",
        severity: "high",
        message: "页面未设置图标，在侧边栏和搜索结果里只有一个默认灰色文档图形。",
        suggestion: `根据标题「${page.title}」推荐使用 ${emoji}。`,
        ops: [
          {
            id: opId(["set_page_icon", page.id]),
            kind: "set_page_icon",
            dimension: "identity",
            reason: `从标题推断页面主题，设置图标 ${emoji}`,
            destructive: false,
            icon: { type: "emoji", emoji },
          },
        ],
      },
    ];
  },
};

const pageCoverRule: Rule = {
  id: "page-cover-missing",
  title: "页面没有封面",
  dimension: "identity",
  rationale:
    "封面决定页面打开瞬间的观感，也是区分「随手记的」和「正式文档」最直接的信号。使用 Notion 自带图库的公开地址，不需要任何图片托管或 API key。",
  check: ({ page, theme }) => {
    if (page.cover) return [];
    // Deterministic pick so the same page always gets the same cover.
    const url = theme.coverGallery[parseInt(shortHash(page.id), 36) % theme.coverGallery.length];
    return [
      {
        ruleId: "page-cover-missing",
        title: "页面没有封面",
        dimension: "identity",
        severity: "medium",
        message: "页面未设置封面图，打开时直接是标题和正文，缺少视觉起点。",
        suggestion: `从「${theme.name}」主题的配图中选一张 Notion 自带封面。`,
        ops: [
          {
            id: opId(["set_page_cover", page.id]),
            kind: "set_page_cover",
            dimension: "identity",
            reason: `套用主题「${theme.name}」的封面图`,
            destructive: false,
            url,
          },
        ],
      },
    ];
  },
};

// --------------------------------------------------------------- hierarchy

const headingSkipRule: Rule = {
  id: "heading-level-skip",
  title: "标题层级跳级",
  dimension: "hierarchy",
  rationale:
    "从二级直接跳到四级会让目录出现断层，读者无法从缩进判断章节归属，Notion 自动生成的目录也会错乱。",
  check: ({ page }) => {
    const findings: Finding[] = [];
    let previous: HeadingLevel | null = null;
    for (const { block } of walk(page.blocks)) {
      const level = headingLevel(block);
      if (!level) continue;
      if (previous !== null && level > previous + 1) {
        const target = (previous + 1) as 2 | 3 | 4;
        findings.push({
          ruleId: "heading-level-skip",
          title: "标题层级跳级",
          dimension: "hierarchy",
          severity: "medium",
          message: `「${excerpt(block)}」是 H${level}，但上一个标题是 H${previous}，中间缺了一级。`,
          suggestion: `提升为 H${target}，保持层级连续。`,
          blockId: block.id,
          excerpt: excerpt(block),
          ops: [
            {
              id: opId(["convert_block", block.id, `h${target}`]),
              kind: "convert_block",
              dimension: "hierarchy",
              reason: `修正跳级：H${level} → H${target}`,
              destructive: false,
              recreates: true,
              blockId: block.id,
              to: `heading_${target}`,
            },
          ],
        });
        previous = target;
      } else {
        previous = level;
      }
    }
    return findings;
  },
};

const boldAsHeadingRule: Rule = {
  id: "bold-paragraph-as-heading",
  title: "用加粗段落充当标题",
  dimension: "hierarchy",
  rationale:
    "通体加粗的短段落在视觉上是标题，但 Notion 不会把它收进目录，也无法折叠和锚点跳转。这是从别处粘贴内容后最常见的结构损伤。",
  check: ({ page }) => {
    const findings: Finding[] = [];
    for (const { block, siblings, index } of walk(page.blocks)) {
      if (block.type !== "paragraph") continue;
      const runs = block.richText ?? [];
      if (runs.length === 0) continue;
      const text = plainText(runs).trim();
      if (!text || visualLength(text) > 40) continue;
      if (!runs.every((r) => r.bold || r.text.trim() === "")) continue;
      if (/[。.!?！？，,、；;]$/.test(text)) continue;
      const next = siblings[index + 1];
      if (!next || isEmptyBlock(next)) continue;
      findings.push({
        ruleId: "bold-paragraph-as-heading",
        title: "用加粗段落充当标题",
        dimension: "hierarchy",
        severity: "medium",
        message: `「${text}」整段加粗且很短，实际在当标题用，但不会进入目录。`,
        suggestion: "转成 H3 标题，这样可以被目录收录、支持折叠和锚点链接。",
        blockId: block.id,
        excerpt: text,
        ops: [
          {
            id: opId(["convert_block", block.id, "h3"]),
            kind: "convert_block",
            dimension: "hierarchy",
            reason: "加粗短段落转为 H3，纳入目录",
            destructive: false,
            recreates: true,
            blockId: block.id,
            to: "heading_3",
          },
        ],
      });
    }
    return findings;
  },
};

const noHeadingsRule: Rule = {
  id: "long-page-without-headings",
  title: "长页面没有任何标题",
  dimension: "hierarchy",
  rationale:
    "没有标题的长页面只能从头读到尾。拆分章节需要理解内容，工具不会替作者臆造标题，只负责把问题指出来。",
  check: ({ page }) => {
    const blocks = flatten(page.blocks);
    const headings = blocks.filter((b) => headingLevel(b) !== null);
    const volume = contentVolume(page);
    if (headings.length > 0) return [];
    if (volume < LONG_PAGE_VOLUME && blocks.length < 12) return [];
    return [
      {
        ruleId: "long-page-without-headings",
        title: "长页面没有任何标题",
        dimension: "hierarchy",
        severity: "high",
        message: `页面约 ${volume} 字宽的内容里没有一个标题，整页是一条平铺的内容流。`,
        suggestion:
          "按主题把内容切成 2–5 节并各加一个 H2。这一步需要理解内容，工具不会代为臆造标题 —— 请调用方 agent 读完正文后自行决定分节位置。",
        ops: [],
      },
    ];
  },
};

const h1OveruseRule: Rule = {
  id: "h1-used-as-section",
  title: "用 H1 当章节标题",
  dimension: "hierarchy",
  rationale:
    "Notion 的页面标题本身已经是 H1。正文里再用 H1 当章节标题会让字号过大、层级上限被占满，习惯做法是章节从 H2 起。",
  check: ({ page }) => {
    const blocks = flatten(page.blocks);
    const h1s = blocks.filter((b) => b.type === "heading_1");
    const h2s = blocks.filter((b) => b.type === "heading_2");
    if (h1s.length < 3 || h2s.length > 0) return [];
    return h1s.map((block) => ({
      ruleId: "h1-used-as-section",
      title: "用 H1 当章节标题",
      dimension: "hierarchy" as const,
      severity: "low" as const,
      message: `页面里有 ${h1s.length} 个 H1 且没有 H2，H1 被当成章节标题在用。`,
      suggestion: "降为 H2。页面标题已经承担 H1 的角色，章节从 H2 开始可以留出层级空间。",
      blockId: block.id,
      excerpt: excerpt(block),
      ops: [
        {
          id: opId(["convert_block", block.id, "h2"]),
          kind: "convert_block" as const,
          dimension: "hierarchy" as const,
          reason: "章节标题从 H1 降为 H2",
          destructive: false,
          recreates: true,
          blockId: block.id,
          to: "heading_2" as const,
        },
      ],
    }));
  },
};

// ------------------------------------------------------------------ rhythm

const sectionDividerRule: Rule = {
  id: "missing-section-divider",
  title: "章节之间缺少分隔",
  dimension: "rhythm",
  rationale:
    "快速滚动一页长文档时，眼睛靠横线而不是字号找章节边界。H2 前的一条分隔线是成本最低的节奏控制手段。",
  check: ({ page, theme }) => {
    if (!theme.structure.dividerBeforeH2) return [];
    const findings: Finding[] = [];
    for (const { block, siblings, index, depth } of walk(page.blocks)) {
      if (block.type !== "heading_2" || depth > 0 || index === 0) continue;
      const previous = siblings[index - 1];
      if (!previous || previous.type === "divider") continue;
      if (previous.type === "table_of_contents") continue;
      findings.push({
        ruleId: "missing-section-divider",
        title: "章节之间缺少分隔",
        dimension: "rhythm",
        severity: "low",
        message: `章节「${excerpt(block)}」直接贴在上一段内容后面，没有视觉断点。`,
        suggestion: "在该标题前插入一条分隔线。",
        blockId: block.id,
        excerpt: excerpt(block),
        ops: [
          {
            id: opId(["insert_block", "divider", block.id]),
            kind: "insert_block",
            dimension: "rhythm",
            reason: `在章节「${excerpt(block, 20)}」前加分隔线`,
            destructive: false,
            after: previous.id,
            block: { id: newBlockId("divider", block.id), type: "divider" },
          },
        ],
      });
    }
    return findings;
  },
};

const wallOfTextRule: Rule = {
  id: "wall-of-text",
  title: "段落过长",
  dimension: "rhythm",
  rationale:
    "超长段落在 Notion 的页面宽度下会变成密不透风的一片，读者会直接跳过。能机械识别出枚举结构的段落可以安全转成列表，其余只报告不改写。",
  check: ({ page, theme }) => {
    const findings: Finding[] = [];
    const limit = theme.structure.maxParagraphChars;
    for (const { block } of walk(page.blocks)) {
      if (block.type !== "paragraph") continue;
      const text = plainText(block.richText);
      const length = visualLength(text);
      if (length <= limit) continue;

      const items = detectInlineList(text);
      const candidates: Candidate[] = [];
      if (items) {
        candidates.push({
          id: opId(["candidate", "list", block.id]),
          blockId: block.id,
          excerpt: excerpt(block, 80),
          question: `这段 ${length} 字宽的段落里似乎有 ${items.length} 条并列项，要拆成列表吗？`,
          variants: [
            {
              label: `拆成 ${items.length} 条无序列表`,
              rationale: "段落内部有明显的枚举结构，拆开后扫读成本大幅下降",
              op: {
                id: opId(["replace_block", block.id, "list"]),
                kind: "replace_block",
                dimension: "rhythm",
                reason: `把 ${length} 字长段拆成 ${items.length} 条列表`,
                destructive: true,
                recreates: true,
                blockId: block.id,
                blocks: items.map((item, i) => ({
                  id: newBlockId("li", `${block.id}-${i}`),
                  type: "bulleted_list_item" as const,
                  richText: [{ text: item }],
                })),
              },
            },
          ],
        });
      }

      findings.push({
        ruleId: "wall-of-text",
        title: "段落过长",
        dimension: "rhythm",
        severity: length > limit * 1.8 ? "medium" : "low",
        message: `段落「${excerpt(block, 24)}」视觉宽度约 ${length}，超过主题上限 ${limit}。`,
        suggestion: items
          ? "段落里有枚举结构，可以拆成列表（改写正文属于破坏性操作，需要显式确认）。"
          : "建议拆成 2–3 段，或把其中的并列内容改成列表。改写正文需要理解语义，交给调用方 agent 决定。",
        blockId: block.id,
        excerpt: excerpt(block, 80),
        ops: [],
        candidates,
      });
    }
    return findings;
  },
};

const paragraphRunRule: Rule = {
  id: "long-paragraph-run",
  title: "连续纯文本段落过多",
  dimension: "rhythm",
  rationale:
    "连续多段纯文本之间没有列表、callout 或分隔线，页面就失去了节奏。这是「内容没问题但读起来累」的典型成因。",
  check: ({ page, theme }) => {
    const findings: Finding[] = [];
    const max = theme.structure.maxConsecutiveParagraphs;

    const scan = (blocks: PolishBlock[]) => {
      let run: PolishBlock[] = [];
      const flush = () => {
        if (run.length > max) {
          const first = run[0];
          findings.push({
            ruleId: "long-paragraph-run",
            title: "连续纯文本段落过多",
            dimension: "rhythm",
            severity: run.length > max * 2 ? "medium" : "low",
            message: `从「${excerpt(first, 24)}」开始有 ${run.length} 个连续纯文本段落，中间没有任何视觉停顿。`,
            suggestion: `主题「${theme.name}」建议连续段落不超过 ${max} 个。可以把其中一段提成 callout、改成列表，或加一个小标题。`,
            blockId: first.id,
            excerpt: excerpt(first, 60),
            ops: [],
          });
        }
        run = [];
      };
      for (const block of blocks) {
        if (block.type === "paragraph" && !isEmptyBlock(block)) run.push(block);
        else flush();
        if (block.children?.length) scan(block.children);
      }
      flush();
    };

    scan(page.blocks);
    return findings;
  },
};

const emptyBlockRule: Rule = {
  id: "empty-block-runs",
  title: "连续空行",
  dimension: "rhythm",
  rationale:
    "用多个空段落手工制造留白，在不同窗口宽度下表现不一致，也会让目录和折叠块的间距错乱。删除空行是破坏性操作，默认只报告不执行。",
  check: ({ page }) => {
    const findings: Finding[] = [];
    const scan = (blocks: PolishBlock[]) => {
      let run: PolishBlock[] = [];
      const flush = () => {
        if (run.length >= 2) {
          findings.push({
            ruleId: "empty-block-runs",
            title: "连续空行",
            dimension: "rhythm",
            severity: "low",
            message: `出现 ${run.length} 个连续空段落，是手工敲出来的留白。`,
            suggestion: "保留一个空行，其余删除；需要明显分隔时改用分隔线。",
            blockId: run[0].id,
            ops: run.slice(1).map((block) => ({
              id: opId(["delete_block", block.id]),
              kind: "delete_block" as const,
              dimension: "rhythm" as const,
              reason: "删除多余空段落",
              destructive: true,
              blockId: block.id,
            })),
          });
        }
        run = [];
      };
      for (const block of blocks) {
        if (isEmptyBlock(block)) run.push(block);
        else flush();
        if (block.children?.length) scan(block.children);
      }
      flush();
    };
    scan(page.blocks);
    return findings;
  },
};

const noAnchorRule: Rule = {
  id: "no-visual-anchor",
  title: "整页没有视觉焦点",
  dimension: "rhythm",
  rationale:
    "一页全是标题和段落时，所有信息权重相同，读者找不到重点。哪一句才是重点属于语义判断，所以这里只给候选，由调用方 agent 决定。",
  check: ({ page, theme }) => {
    const blocks = flatten(page.blocks);
    if (contentVolume(page) < LONG_PAGE_VOLUME && blocks.length < 15) return [];
    const hasAnchor = blocks.some(
      (b) => b.type === "callout" || b.type === "quote" || b.type === "image",
    );
    if (hasAnchor) return [];

    const candidates: Candidate[] = [];
    for (const block of blocks) {
      if (block.type !== "paragraph") continue;
      const text = plainText(block.richText);
      const intent = detectIntent(text);
      if (!intent) continue;
      const style = theme.callouts[intent];
      candidates.push({
        id: opId(["candidate", "callout", block.id]),
        blockId: block.id,
        excerpt: excerpt(block, 80),
        question: `这段以提示词开头，像是一条「${intent}」类旁注，要提成 callout 吗？`,
        variants: [
          {
            label: `提成 ${style.emoji} callout`,
            rationale: `段首出现 ${intent} 类标志词，转成 callout 后能从正文中跳出来`,
            op: {
              id: opId(["convert_block", block.id, "callout", intent]),
              kind: "convert_block",
              dimension: "rhythm",
              reason: `提成 ${style.emoji} callout（${intent}）`,
              destructive: false,
              recreates: true,
              blockId: block.id,
              to: "callout",
              intent,
              icon: { type: "emoji", emoji: style.emoji },
              color: style.color,
            },
          },
          {
            label: "保持段落不变",
            rationale: "如果这段只是过渡说明，提成 callout 反而会抢走真正重点的注意力",
            op: null,
          },
        ],
      });
      if (candidates.length >= 5) break;
    }

    return [
      {
        ruleId: "no-visual-anchor",
        title: "整页没有视觉焦点",
        dimension: "rhythm",
        severity: "medium",
        message: `约 ${contentVolume(page)} 字宽的内容里没有一个 callout、引用或图片，所有内容视觉权重相同。`,
        suggestion:
          candidates.length > 0
            ? `识别出 ${candidates.length} 段带提示词的内容，可以考虑提成 callout —— 由调用方 agent 判断取舍。`
            : "挑 1–2 条最关键的结论提成 callout。哪句是重点需要理解内容，工具不代为决定。",
        ops: [],
        candidates,
      },
    ];
  },
};

// ------------------------------------------------------------- consistency

const offPaletteRule: Rule = {
  id: "off-palette-color",
  title: "使用了主题调色板外的颜色",
  dimension: "consistency",
  rationale:
    "页面显得业余，通常不是颜色不好看，而是颜色太多。把越界的颜色吸附回主题调色板，是最立竿见影的一致性修复。",
  check: ({ page, theme }) => {
    const findings: Finding[] = [];
    for (const { block } of walk(page.blocks)) {
      // Callout styling belongs to `callout-style-off-system`.
      if (block.type === "callout") continue;
      const color = block.color;
      if (!color || color === "default") continue;
      if (isInPalette(theme, color)) continue;
      const snapped = snapToPalette(theme, color);
      if (snapped === color) continue;
      findings.push({
        ruleId: "off-palette-color",
        title: "使用了主题调色板外的颜色",
        dimension: "consistency",
        severity: "medium",
        message: `「${excerpt(block)}」用了 ${color}，不在「${theme.name}」的调色板内。`,
        suggestion: `吸附到最接近的主题色 ${snapped}。`,
        blockId: block.id,
        excerpt: excerpt(block),
        ops: [
          {
            id: opId(["set_block_color", block.id, snapped]),
            kind: "set_block_color",
            dimension: "consistency",
            reason: `${color} → ${snapped}，收回主题调色板`,
            destructive: false,
            blockId: block.id,
            color: snapped,
            previousColor: color,
          },
        ],
      });
    }
    return findings;
  },
};

const backgroundSprawlRule: Rule = {
  id: "background-color-sprawl",
  title: "背景色种类过多",
  dimension: "consistency",
  rationale:
    "每种背景色都应该固定代表一类信息。超过三四种之后，颜色不再传递含义，只剩噪音。",
  check: ({ page, theme }) => {
    const max = theme.structure.maxDistinctBackgrounds;

    // Callouts are excluded: their background is dictated by the theme's
    // semantic mapping, not by this page's colour budget.
    const usage = new Map<string, PolishBlock[]>();
    for (const block of flatten(page.blocks)) {
      if (block.type === "callout") continue;
      const color = block.color;
      if (!color || !color.endsWith("_background")) continue;
      usage.set(color, [...(usage.get(color) ?? []), block]);
    }
    const backgrounds = [...usage.keys()];
    if (backgrounds.length <= max) return [];
    // Keep the most used colours; collapse the long tail into the neutral.
    const ranked = [...usage.entries()].sort((a, b) => b[1].length - a[1].length);
    const keep = new Set(ranked.slice(0, max).map(([color]) => color));
    const ops: Op[] = [];
    for (const [color, blocks] of ranked) {
      if (keep.has(color)) continue;
      for (const block of blocks) {
        ops.push({
          id: opId(["set_block_color", block.id, theme.neutralBackground]),
          kind: "set_block_color",
          dimension: "consistency",
          reason: `${color} 在本页只用了 ${blocks.length} 次，收敛到中性底色`,
          destructive: false,
          blockId: block.id,
          color: theme.neutralBackground,
          previousColor: color as NotionBackgroundColor,
        });
      }
    }

    return [
      {
        ruleId: "background-color-sprawl",
        title: "背景色种类过多",
        dimension: "consistency",
        severity: "medium",
        message: `页面用了 ${backgrounds.length} 种背景色（${backgrounds.join("、")}），超过主题上限 ${max}。`,
        suggestion: `保留使用最多的 ${max} 种，其余收敛到 ${theme.neutralBackground}。`,
        ops,
      },
    ];
  },
};

/**
 * Callout icon and background are decided together, by one rule.
 *
 * An earlier version split this across three rules and they contradicted each
 * other: the palette rule pushed a callout to the neutral background while the
 * icon rule gave it an emoji whose theme colour was blue, so the page ended up
 * with an icon and a background telling the reader two different things. A
 * callout's styling has a single owner now, and the generic palette rules skip
 * callouts entirely.
 */
const calloutStyleRule: Rule = {
  id: "callout-style-off-system",
  title: "callout 没有按主题的语义体系配置",
  dimension: "consistency",
  rationale:
    "callout 的图标是它的标签，底色是它的语气，两者必须来自同一套语义定义。图标和底色对不上，或者每个 callout 各用一套，读者就无法通过外观判断这段话的分量。",
  check: ({ page, theme }) => {
    const findings: Finding[] = [];
    const emojiToIntent = new Map<string, CalloutIntent>();
    for (const [intent, style] of Object.entries(theme.callouts)) {
      emojiToIntent.set(style.emoji, intent as CalloutIntent);
    }

    for (const { block } of walk(page.blocks)) {
      if (block.type !== "callout") continue;

      const currentEmoji = block.icon?.type === "emoji" ? block.icon.emoji : undefined;
      // An in-system emoji is taken as the author's stated intent; otherwise
      // fall back to reading marker words out of the text.
      const stated = currentEmoji ? emojiToIntent.get(currentEmoji) : undefined;
      const intent = stated ?? intentFor(block);
      const style = theme.callouts[intent];

      const ops: Op[] = [];
      const problems: string[] = [];

      if (currentEmoji !== style.emoji) {
        problems.push(
          currentEmoji ? `图标 ${currentEmoji} 不在主题图标集内` : "没有图标，只是一个带底色的方块",
        );
        ops.push({
          id: opId(["set_callout_icon", block.id, style.emoji]),
          kind: "set_callout_icon",
          dimension: "consistency",
          reason: currentEmoji
            ? `${currentEmoji} → ${style.emoji}，收敛到主题图标集`
            : `补上 ${style.emoji} 图标（判定为 ${intent}）`,
          destructive: false,
          blockId: block.id,
          icon: { type: "emoji", emoji: style.emoji },
        });
      }

      if (block.color !== style.color) {
        problems.push(`底色 ${block.color ?? "default"} 与语义「${intent}」不匹配`);
        ops.push({
          id: opId(["set_block_color", block.id, style.color]),
          kind: "set_block_color",
          dimension: "consistency",
          reason: `语义 ${intent} 对应底色 ${style.color}`,
          destructive: false,
          blockId: block.id,
          color: style.color,
          previousColor: block.color,
        });
      }

      if (ops.length === 0) continue;

      findings.push({
        ruleId: "callout-style-off-system",
        title: "callout 没有按主题的语义体系配置",
        dimension: "consistency",
        severity: currentEmoji ? "low" : "medium",
        message: `callout「${excerpt(block)}」：${problems.join("；")}。`,
        suggestion: `判定语义为「${intent}」，统一为 ${style.emoji} + ${style.color}。`,
        blockId: block.id,
        excerpt: excerpt(block),
        ops,
      });
    }

    return findings;
  },
};

const calloutSprawlRule: Rule = {
  id: "callout-icon-sprawl",
  title: "callout 图标种类过多",
  dimension: "consistency",
  rationale:
    "即使每个图标都在主题图标集内，一页里出现太多种类也会让它们失去分类作用。这条规则只报告，具体收敛哪几个需要理解内容。",
  check: ({ page, theme }) => {
    const used = calloutEmojis(page.blocks);
    const max = theme.structure.maxDistinctCalloutEmojis;
    if (used.length <= max) return [];
    return [
      {
        ruleId: "callout-icon-sprawl",
        title: "callout 图标种类过多",
        dimension: "consistency",
        severity: "low",
        message: `页面的 callout 用了 ${used.length} 种图标（${used.join("")}），超过主题上限 ${max}。`,
        suggestion: "合并语义相近的 callout 类型。哪些可以合并需要理解内容，工具不代为决定。",
        ops: [],
      },
    ];
  },
};

const intentParagraphRule: Rule = {
  id: "intent-paragraph-not-elevated",
  title: "带提示词的段落没有提成 callout",
  dimension: "rhythm",
  rationale:
    "以「注意：」「重要：」开头的段落，作者已经明确表达了这段比周围重要，但在视觉上它和普通正文完全一样。这类标志词足够明确，转换又完整保留原文、随时可以改回，所以作为自动操作而非候选项。",
  check: ({ page, theme }) => {
    const matched: Array<{ block: PolishBlock; intent: CalloutIntent }> = [];
    for (const { block } of walk(page.blocks)) {
      if (block.type !== "paragraph") continue;
      const text = plainText(block.richText);
      if (!text.trim()) continue;
      // A very long callout is worse than a plain paragraph.
      if (visualLength(text) > 300) continue;
      const intent = detectIntent(text);
      if (!intent) continue;
      matched.push({ block, intent });
    }
    if (matched.length === 0) return [];

    // Strongest signals first, so the cap keeps the asides that matter most.
    const priority: CalloutIntent[] = ["warning", "key", "tip", "success", "question", "info", "quote"];
    matched.sort((a, b) => priority.indexOf(a.intent) - priority.indexOf(b.intent));

    const MAX_AUTO = 3;
    const findings: Finding[] = [];

    matched.forEach(({ block, intent }, i) => {
      const style = theme.callouts[intent];
      const convert: Op = {
        id: opId(["convert_block", block.id, "callout", intent]),
        kind: "convert_block",
        dimension: "rhythm",
        reason: `段首「${intent}」标志词，提成 ${style.emoji} callout`,
        destructive: false,
        recreates: true,
        blockId: block.id,
        to: "callout",
        intent,
        icon: { type: "emoji", emoji: style.emoji },
        color: style.color,
      };

      const withinCap = i < MAX_AUTO;
      findings.push({
        ruleId: "intent-paragraph-not-elevated",
        title: "带提示词的段落没有提成 callout",
        dimension: "rhythm",
        severity: intent === "warning" || intent === "key" ? "medium" : "low",
        message: `「${excerpt(block, 32)}」以「${intent}」类标志词开头，但视觉上和普通正文无异。`,
        suggestion: withinCap
          ? `提成 ${style.emoji} callout（${style.color}）。`
          : `同类段落已超过 ${MAX_AUTO} 个，再提就会变成满屏 callout —— 这一条留给调用方 agent 判断。`,
        blockId: block.id,
        excerpt: excerpt(block, 80),
        ops: withinCap ? [convert] : [],
        candidates: withinCap
          ? undefined
          : [
              {
                id: opId(["candidate", "callout", block.id]),
                blockId: block.id,
                excerpt: excerpt(block, 80),
                question: `本页带提示词的段落较多，这一段也要提成 ${style.emoji} callout 吗？`,
                variants: [
                  {
                    label: `提成 ${style.emoji} callout`,
                    rationale: "如果这确实是一条独立的重要提示",
                    op: convert,
                  },
                  {
                    label: "保持段落不变",
                    rationale: "callout 过多会互相稀释，不如留给最关键的几条",
                    op: null,
                  },
                ],
              },
            ],
      });
    });

    return findings;
  },
};

const codeLanguageRule: Rule = {
  id: "code-language-missing",
  title: "代码块没有设置语言",
  dimension: "consistency",
  rationale:
    "语言留在 plain text 的代码块没有语法高亮，一片灰字。语言可以从代码特征机械推断，是少数能完全自动修复的问题。",
  check: ({ page }) => {
    const findings: Finding[] = [];
    for (const { block } of walk(page.blocks)) {
      if (block.type !== "code") continue;
      const current = block.language;
      if (current && current !== "plain text" && current !== "plaintext") continue;
      const code = plainText(block.richText);
      const guess = detectLanguage(code);
      if (!guess) continue;
      findings.push({
        ruleId: "code-language-missing",
        title: "代码块没有设置语言",
        dimension: "consistency",
        severity: "medium",
        message: `代码块「${excerpt(block, 32)}」语言是 plain text，没有语法高亮。`,
        suggestion: `从代码特征判断为 ${guess}。`,
        blockId: block.id,
        excerpt: excerpt(block, 60),
        ops: [
          {
            id: opId(["set_code_language", block.id, guess]),
            kind: "set_code_language",
            dimension: "consistency",
            reason: `代码块语言设为 ${guess}，开启语法高亮`,
            destructive: false,
            blockId: block.id,
            language: guess,
          },
        ],
      });
    }
    return findings;
  },
};

const boldOveruseRule: Rule = {
  id: "bold-overuse",
  title: "加粗过多",
  dimension: "consistency",
  rationale:
    "当三分之一的正文都是加粗时，加粗就不再是强调。取消加粗会改写作者的原始格式，因此这条规则的修复操作默认被扣在 withheld 里。",
  check: ({ page, theme }) => {
    const { ratio, boldChars, totalChars } = boldRatio(page.blocks);
    const ceiling = theme.structure.boldRatioCeiling;
    if (totalChars < 200 || ratio <= ceiling) return [];

    const ops: Op[] = [];
    for (const block of flatten(page.blocks)) {
      if (block.type !== "paragraph") continue;
      const runs = block.richText ?? [];
      const boldLen = runs.filter((r) => r.bold).reduce((n, r) => n + visualLength(r.text), 0);
      const allLen = runs.reduce((n, r) => n + visualLength(r.text), 0);
      if (allLen < 60 || boldLen / allLen < 0.6) continue;
      ops.push({
        id: opId(["set_rich_text", block.id, "unbold"]),
        kind: "set_rich_text",
        dimension: "consistency",
        reason: "整段加粗失去强调意义，取消加粗",
        destructive: true,
        blockId: block.id,
        richText: runs.map((r) => ({ ...r, bold: false })),
      });
    }

    return [
      {
        ruleId: "bold-overuse",
        title: "加粗过多",
        dimension: "consistency",
        severity: "medium",
        message: `正文有 ${Math.round(ratio * 100)}% 的字是加粗的（${boldChars}/${totalChars}），超过主题上限 ${Math.round(ceiling * 100)}%。`,
        suggestion:
          "只保留真正的关键词加粗。整段加粗的段落建议取消加粗 —— 这会改写作者格式，属于破坏性操作。",
        ops,
      },
    ];
  },
};

// -------------------------------------------------------------- navigation

const tocRule: Rule = {
  id: "toc-missing",
  title: "长页面缺少目录",
  dimension: "navigation",
  rationale:
    "章节数超过阈值后，读者需要先看见全貌才能决定读哪一段。Notion 的目录块自动跟随标题更新，加一次长期有效。",
  check: ({ page, theme }) => {
    const blocks = flatten(page.blocks);
    const headings = blocks.filter((b) => {
      const level = headingLevel(b);
      return level !== null && level >= 2;
    });
    if (headings.length < theme.structure.tocThreshold) return [];
    if (blocks.some((b) => b.type === "table_of_contents")) return [];

    return [
      {
        ruleId: "toc-missing",
        title: "长页面缺少目录",
        dimension: "navigation",
        severity: "high",
        message: `页面有 ${headings.length} 个章节标题却没有目录，读者无法快速跳转。`,
        suggestion: "在页面顶部插入目录块，它会自动跟随标题变化。",
        ops: [
          {
            id: opId(["insert_block", "toc", page.id]),
            kind: "insert_block",
            dimension: "navigation",
            reason: `${headings.length} 个章节，顶部插入目录块`,
            destructive: false,
            after: null,
            block: { id: newBlockId("toc", page.id), type: "table_of_contents" },
          },
        ],
      },
    ];
  },
};

const tocDuplicateRule: Rule = {
  id: "toc-duplicated",
  title: "页面有多个目录块",
  dimension: "navigation",
  rationale: "重复的目录块通常是复制粘贴或工具重复执行的残留，保留一个即可。",
  check: ({ page }) => {
    const tocs = flatten(page.blocks).filter((b) => b.type === "table_of_contents");
    if (tocs.length <= 1) return [];
    return [
      {
        ruleId: "toc-duplicated",
        title: "页面有多个目录块",
        dimension: "navigation",
        severity: "low",
        message: `页面有 ${tocs.length} 个目录块。`,
        suggestion: "保留第一个，删除其余。",
        blockId: tocs[1].id,
        ops: tocs.slice(1).map((block) => ({
          id: opId(["delete_block", block.id]),
          kind: "delete_block" as const,
          dimension: "navigation" as const,
          reason: "删除重复的目录块",
          destructive: true,
          blockId: block.id,
        })),
      },
    ];
  },
};

export const RULES: Rule[] = [
  pageIconRule,
  pageCoverRule,
  headingSkipRule,
  boldAsHeadingRule,
  noHeadingsRule,
  h1OveruseRule,
  sectionDividerRule,
  wallOfTextRule,
  paragraphRunRule,
  emptyBlockRule,
  noAnchorRule,
  intentParagraphRule,
  offPaletteRule,
  backgroundSprawlRule,
  calloutStyleRule,
  calloutSprawlRule,
  codeLanguageRule,
  boldOveruseRule,
  tocRule,
  tocDuplicateRule,
  ...COMPOSE_RULES,
];

export function runRules(page: PolishPage, themeId?: string): Finding[] {
  const theme = getTheme(themeId);
  const ctx: RuleContext = { page, theme };
  return RULES.flatMap((rule) => {
    try {
      return rule.check(ctx);
    } catch {
      // A broken rule must never take down an audit of someone's page.
      return [];
    }
  });
}
