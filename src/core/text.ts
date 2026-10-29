/**
 * Text and block-tree helpers.
 *
 * Everything here is deterministic. These are the measurements an agent cannot
 * do reliably by reading a page — counting colours across 200 blocks, spotting
 * a heading level skip, measuring how much of a page is bold.
 */

import type { CalloutIntent, PolishBlock, RichText } from "./types";

export function plainText(richText?: RichText[]): string {
  if (!richText) return "";
  return richText.map((r) => r.text).join("");
}

/**
 * Visual width rather than code point count: a CJK glyph occupies roughly two
 * latin character widths, so a 200-character Chinese paragraph is as long on
 * screen as a 400-character English one.
 */
export function visualLength(text: string): number {
  let width = 0;
  for (const ch of text) {
    width += /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/.test(ch)
      ? 2
      : 1;
  }
  return width;
}

export type WalkEntry = {
  block: PolishBlock;
  /** Siblings of this block, in order. */
  siblings: PolishBlock[];
  index: number;
  depth: number;
  parentId: string | null;
};

/** Depth-first walk that keeps sibling context, which most rules need. */
export function walk(blocks: PolishBlock[], parentId: string | null = null, depth = 0): WalkEntry[] {
  const out: WalkEntry[] = [];
  blocks.forEach((block, index) => {
    out.push({ block, siblings: blocks, index, depth, parentId });
    if (block.children?.length) {
      out.push(...walk(block.children, block.id, depth + 1));
    }
  });
  return out;
}

export function flatten(blocks: PolishBlock[]): PolishBlock[] {
  return walk(blocks).map((e) => e.block);
}

export function findBlock(blocks: PolishBlock[], id: string): PolishBlock | undefined {
  return flatten(blocks).find((b) => b.id === id);
}

export type HeadingLevel = 1 | 2 | 3 | 4;

export function headingLevel(block: PolishBlock): HeadingLevel | null {
  switch (block.type) {
    case "heading_1":
      return 1;
    case "heading_2":
      return 2;
    case "heading_3":
      return 3;
    case "heading_4":
      return 4;
    default:
      return null;
  }
}

export function isHeading(block: PolishBlock): boolean {
  return headingLevel(block) !== null;
}

export function isListItem(block: PolishBlock): boolean {
  return (
    block.type === "bulleted_list_item" ||
    block.type === "numbered_list_item" ||
    block.type === "to_do"
  );
}

/** A block that contributes nothing visually — an empty paragraph. */
export function isEmptyBlock(block: PolishBlock): boolean {
  if (block.type !== "paragraph") return false;
  if (block.children?.length) return false;
  return plainText(block.richText).trim().length === 0;
}

/** Share of body characters wrapped in bold, across paragraphs and list items. */
export function boldRatio(blocks: PolishBlock[]): { ratio: number; boldChars: number; totalChars: number } {
  let bold = 0;
  let total = 0;
  for (const block of flatten(blocks)) {
    if (block.type !== "paragraph" && !isListItem(block)) continue;
    for (const run of block.richText ?? []) {
      const len = visualLength(run.text);
      total += len;
      if (run.bold) bold += len;
    }
  }
  return { ratio: total === 0 ? 0 : bold / total, boldChars: bold, totalChars: total };
}

export function distinctColors(blocks: PolishBlock[]): {
  backgrounds: string[];
  texts: string[];
} {
  const backgrounds = new Set<string>();
  const texts = new Set<string>();
  for (const block of flatten(blocks)) {
    const color = block.color;
    if (!color || color === "default") continue;
    if (color.endsWith("_background")) backgrounds.add(color);
    else texts.add(color);
  }
  return { backgrounds: [...backgrounds], texts: [...texts] };
}

export function calloutEmojis(blocks: PolishBlock[]): string[] {
  const set = new Set<string>();
  for (const block of flatten(blocks)) {
    if (block.type !== "callout") continue;
    if (block.icon?.type === "emoji") set.add(block.icon.emoji);
  }
  return [...set];
}

/**
 * Marker words that reveal what a paragraph is doing. Used to propose a callout
 * intent — never to apply one silently, since a false positive is a visible
 * mistake on someone's page.
 */
const INTENT_MARKERS: Array<{ intent: CalloutIntent; patterns: RegExp[] }> = [
  {
    intent: "warning",
    patterns: [/^\s*(注意|警告|小心|切记|风险|坑|caution|warning|careful)[:：!！\s]/i],
  },
  {
    intent: "key",
    patterns: [/^\s*(重要|关键|核心|结论|要点|考点|考點|总结|takeaway|key|important|tl;?dr)[:：\s]/i],
  },
  {
    intent: "tip",
    patterns: [/^\s*(提示|技巧|建议|窍门|最佳实践|tip|hint|pro tip|suggestion)[:：\s]/i],
  },
  {
    intent: "info",
    patterns: [/^\s*(说明|备注|补充|注|前提|背景|note|info|context|fyi)[:：\s]/i],
  },
  {
    intent: "success",
    patterns: [/^\s*(完成|已完成|成功|搞定|done|shipped|resolved)[:：\s]/i],
  },
  {
    intent: "question",
    patterns: [/^\s*(问题|疑问|待确认|思考|open question|question|todo)[:：\s]/i],
  },
];

export function detectIntent(text: string): CalloutIntent | null {
  const trimmed = text.trim();
  for (const { intent, patterns } of INTENT_MARKERS) {
    if (patterns.some((p) => p.test(trimmed))) return intent;
  }
  return null;
}

const LANGUAGE_SIGNATURES: Array<{ language: string; score: (code: string) => number }> = [
  {
    language: "typescript",
    score: (c) =>
      count(c, /\b(interface|type)\s+\w+\s*[={]/g) * 3 +
      count(c, /:\s*(string|number|boolean|void|unknown|any)\b/g) * 2 +
      count(c, /\bimport\s+.*\bfrom\s+['"]/g),
  },
  {
    language: "javascript",
    score: (c) =>
      count(c, /\b(const|let|function|=>)\b/g) +
      count(c, /\brequire\(/g) * 2 +
      count(c, /console\.log/g) * 2,
  },
  {
    language: "python",
    score: (c) =>
      count(c, /^\s*def\s+\w+\(/gm) * 3 +
      count(c, /^\s*from\s+\w+\s+import\b/gm) * 3 +
      count(c, /^\s*import\s+\w+$/gm) * 2 +
      count(c, /\bself\b/g),
  },
  {
    language: "bash",
    score: (c) =>
      count(c, /^\s*\$\s/gm) * 3 +
      // A line that starts with a shell command is the strongest signal.
      count(
        c,
        /^\s*(openssl|curl|wget|ssh|scp|chmod|chown|mkdir|rm|cp|mv|ln|tar|unzip|export|echo|cat|grep|sed|awk|find|xargs|kubectl|docker|docker-compose|git|npm|npx|yarn|pnpm|bun|pip3?|python3?|node|deno|make|cargo|go|brew|apt|apt-get|yum|sudo|cd|source|which|ps|kill|systemctl|journalctl)\b/gm,
      ) * 3 +
      // Backslash line continuations and short flags.
      count(c, /\\\s*$/gm) * 2 +
      count(c, /\s-[a-zA-Z]\s/g) +
      count(c, /^#!/m) * 3,
  },
  {
    language: "json",
    score: (c) => (/^\s*[[{]/.test(c.trim()) && /["}\]]\s*$/.test(c.trim()) ? count(c, /"\w+"\s*:/g) * 2 : 0),
  },
  {
    language: "sql",
    score: (c) => count(c, /\b(select|from|where|join|group by|insert into|update|create table)\b/gi) * 2,
  },
  {
    language: "yaml",
    score: (c) => (count(c, /^\s*[\w-]+:\s*\S/gm) > 2 && !/[{};]/.test(c) ? count(c, /^\s*[\w-]+:/gm) : 0),
  },
  {
    language: "go",
    score: (c) => count(c, /\bfunc\s+\w+\(/g) * 3 + count(c, /\bpackage\s+\w+/g) * 3,
  },
  {
    language: "rust",
    score: (c) => count(c, /\bfn\s+\w+\(/g) * 3 + count(c, /\blet\s+mut\b/g) * 3,
  },
];

function count(text: string, re: RegExp): number {
  return (text.match(re) ?? []).length;
}

/** Best-effort language guess for code blocks left on "plain text". */
export function detectLanguage(code: string): string | null {
  if (code.trim().length < 12) return null;
  let best: { language: string; score: number } | null = null;
  for (const sig of LANGUAGE_SIGNATURES) {
    const score = sig.score(code);
    if (score > 0 && (!best || score > best.score)) best = { language: sig.language, score };
  }
  return best && best.score >= 3 ? best.language : null;
}

/**
 * Keyword to emoji map for page icons. Ordered: the first match wins, so more
 * specific terms come first.
 */
const ICON_KEYWORDS: Array<[RegExp, string]> = [
  [/周报|日报|月报|report|weekly|standup/i, "🗓️"],
  [/路线图|roadmap|规划|plan(ning)?\b/i, "🗺️"],
  [/会议|meeting|评审|review|纪要/i, "📝"],
  [/需求|prd|spec|规格|设计文档|rfc/i, "📐"],
  [/架构|architecture|系统设计|design doc/i, "🏗️"],
  [/api|接口|sdk|集成|integration/i, "🔌"],
  [/数据库|database|schema|数据模型/i, "🗄️"],
  [/部署|deploy|运维|ops|infra|发布/i, "🚀"],
  [/测试|test|qa|质量/i, "🧪"],
  [/bug|故障|事故|incident|排查|postmortem|复盘/i, "🔧"],
  [/安全|security|权限|auth/i, "🔐"],
  [/指标|metrics|数据分析|analytics|看板|dashboard/i, "📊"],
  [/财务|预算|成本|budget|cost|pricing|定价/i, "💰"],
  [/招聘|面试|hiring|interview|onboard|入职/i, "🤝"],
  [/读书|书评|book|阅读|reading/i, "📚"],
  [/学习|课程|笔记|note|学习计划|course/i, "🎓"],
  [/日记|journal|随笔|diary|复盘总结/i, "🌙"],
  [/灵感|想法|idea|brainstorm|脑暴/i, "✨"],
  [/旅行|travel|行程|itinerary/i, "✈️"],
  [/食谱|菜谱|recipe|美食/i, "🍳"],
  [/健身|运动|health|训练|fitness/i, "💪"],
  [/清单|checklist|todo|待办|任务/i, "✅"],
  [/手册|指南|guide|manual|教程|tutorial|上手/i, "📖"],
  [/常见问题|faq|问答/i, "❓"],
  [/项目|project/i, "📦"],
  [/团队|team|组织|org/i, "👥"],
  [/产品|product|功能|feature/i, "🧩"],
  [/营销|marketing|增长|growth|运营/i, "📣"],
  [/竞品|调研|research|分析报告/i, "🔍"],
];

export function suggestPageIcon(title: string, fallback: string): string {
  for (const [pattern, emoji] of ICON_KEYWORDS) {
    if (pattern.test(title)) return emoji;
  }
  return fallback;
}

/** Stable short hash, used to build deterministic op ids. */
export function shortHash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/**
 * Splits a run-on paragraph into the list items it is really trying to be.
 * Only returns a result when the paragraph has an obvious enumerated shape, so
 * that ordinary prose is never shredded.
 */
export function detectInlineList(text: string): string[] | null {
  const trimmed = text.trim();
  const numbered = trimmed.split(/(?:^|[\s；;，,。])(?=(?:[1-9]|1[0-9])\s*[.、)）]\s*\S)/g).map((s) => s.trim()).filter(Boolean);
  if (numbered.length >= 3 && numbered.every((s) => /^(?:[1-9]|1[0-9])\s*[.、)）]/.test(s))) {
    return numbered.map((s) => s.replace(/^(?:[1-9]|1[0-9])\s*[.、)）]\s*/, ""));
  }
  const bulleted = trimmed
    .split(/\s*[;；]\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (bulleted.length >= 3 && bulleted.every((s) => visualLength(s) <= 80)) {
    return bulleted;
  }
  return null;
}

/** Sentences, keeping the closing punctuation on each piece. */
export function sentences(text: string): string[] {
  return text
    .split(/(?<=[。！？!?])/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * A heading hidden in the opening of a paragraph, for pages that were never
 * given headings at all. "锚定效应这一章最让我意外" yields "锚定效应". Returns
 * null unless the title looks like a name rather than the start of a sentence.
 */
export function topicHeading(text: string): string | null {
  const sentence = sentences(text)[0] ?? text.trim();
  const patterns = [
    /^([\u4e00-\u9fffA-Za-z0-9]{2,12})(?:这一章|那一章|这章|这一节|这节)/,
    /^([\u4e00-\u9fffA-Za-z0-9]{2,12})(?:讲的是|说的是|指的是|讨论的是)/,
    /^([\u4e00-\u9fffA-Za-z0-9]{2,8})是/,
  ];
  for (const pattern of patterns) {
    const match = sentence.match(pattern);
    if (!match) continue;
    const title = match[1];
    if (/^(我|你|他|她|它|这|那|其|本|该|我们|他们|这个|那个)/.test(title)) continue;
    if (/[的了是不在和与或，,]/.test(title)) continue;
    return title;
  }
  return null;
}

/**
 * Breaks a paragraph at sentence boundaries so each piece fits the theme's
 * length budget. Returns null when the text is already short, has fewer than
 * three sentences, or would not actually get shorter.
 */
export function splitBySentences(text: string, maxVisual: number): string[] | null {
  if (visualLength(text) <= maxVisual) return null;
  const parts = sentences(text);
  if (parts.length < 3) return null;
  const groups: string[] = [];
  let current = "";
  for (const part of parts) {
    const candidate = current ? `${current}${part}` : part;
    if (current && visualLength(candidate) > maxVisual) {
      groups.push(current);
      current = part;
    } else {
      current = candidate;
    }
  }
  if (current) groups.push(current);
  return groups.length >= 2 ? groups : null;
}

/** First sentence lifted out as a lede, the rest left as the body. */
export function splitLede(text: string): { lede: string; rest: string } | null {
  const parts = sentences(text);
  if (parts.length < 2) return null;
  const lede = parts[0];
  if (visualLength(lede) < 16 || visualLength(lede) > 180) return null;
  const rest = parts.slice(1).join("");
  if (visualLength(rest) < 16) return null;
  return { lede, rest };
}

const METRIC = /(\d+(?:\.\d+)?%|\d+(?:\.\d+)?\s*(?:人|次|元|倍|条|天|周|小时|分钟))/g;

/**
 * Adds emphasis a typeset page would have added: the label before a colon,
 * and numbers that carry a unit or a percent. Returns null when nothing changes.
 * Existing bold, code and links are left alone.
 */
export function polishInline(runs: RichText[]): RichText[] | null {
  if (runs.length === 0) return null;
  if (runs.some((run) => run.code)) return null;

  let next = runs.map((run) => ({ ...run }));
  const first = next[0];
  if (first && !first.bold && !first.href && first.equation === undefined) {
    const match = first.text.match(/^([^\n：:]{2,16})([：:])([\s\S]*)$/);
    const label = match?.[1];
    if (match && label && !/[。！？，,]/.test(label)) {
      const pieces: RichText[] = [{ ...first, text: `${label}${match[2]}`, bold: true }];
      if (match[3]) pieces.push({ ...first, text: match[3], bold: false });
      next = [...pieces, ...next.slice(1)];
    }
  }

  const withMetrics: RichText[] = [];
  let changed = next.some((run, index) => run.bold !== runs[index]?.bold || run.text !== runs[index]?.text);
  for (const run of next) {
    if (run.bold || run.href || run.equation !== undefined) {
      withMetrics.push(run);
      continue;
    }
    METRIC.lastIndex = 0;
    if (!METRIC.test(run.text)) {
      withMetrics.push(run);
      continue;
    }
    METRIC.lastIndex = 0;
    let cursor = 0;
    for (const match of run.text.matchAll(METRIC)) {
      const start = match.index ?? 0;
      if (start > cursor) withMetrics.push({ ...run, text: run.text.slice(cursor, start) });
      withMetrics.push({ ...run, text: match[0], bold: true });
      cursor = start + match[0].length;
      changed = true;
    }
    if (cursor < run.text.length) withMetrics.push({ ...run, text: run.text.slice(cursor) });
  }

  if (!changed) return null;
  return withMetrics.filter((run) => run.text.length > 0);
}
