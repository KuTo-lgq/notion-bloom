/**
 * Translation between Notion's block schema and the toolkit's normalized model.
 *
 * The normalized model is deliberately smaller. Block types it does not
 * understand become `unsupported` and are never rewritten, so an apply cannot
 * destroy content the rules cannot see.
 */

import type {
  BlockObjectRequest,
  BlockObjectResponse,
  LanguageRequest,
  PageObjectResponse,
  RichTextItemRequest,
  RichTextItemResponse,
} from "@notionhq/client/build/src/api-endpoints";

import type { BlockType, NotionColor, PolishBlock, PolishPage, RichText } from "@/core/types";
import { ALL_NOTION_COLORS } from "@/core/types";

const SUPPORTED = new Set<string>([
  "paragraph",
  "heading_1",
  "heading_2",
  "heading_3",
  "heading_4",
  "bulleted_list_item",
  "numbered_list_item",
  "to_do",
  "toggle",
  "callout",
  "quote",
  "code",
  "divider",
  "image",
  "bookmark",
  "table_of_contents",
  "column_list",
  "column",
  "breadcrumb",
  "equation",
]);

const LANGUAGES = new Set<string>([
  "abap", "abc", "agda", "arduino", "ascii art", "assembly", "bash", "basic", "bnf", "c", "c#",
  "c++", "clojure", "coffeescript", "coq", "css", "dart", "dhall", "diff", "docker", "ebnf",
  "elixir", "elm", "erlang", "f#", "flow", "fortran", "gherkin", "glsl", "go", "graphql",
  "groovy", "haskell", "hcl", "html", "idris", "java", "javascript", "json", "julia", "kotlin",
  "latex", "less", "lisp", "livescript", "llvm ir", "lua", "makefile", "markdown", "markup",
  "matlab", "mathematica", "mermaid", "nix", "notion formula", "objective-c", "ocaml", "pascal",
  "perl", "php", "plain text", "powershell", "prolog", "protobuf", "purescript", "python", "r",
  "racket", "reason", "ruby", "rust", "sass", "scala", "scheme", "scss", "shell", "smalltalk",
  "solidity", "sql", "swift", "toml", "typescript", "vb.net", "verilog", "vhdl", "visual basic",
  "webassembly", "xml", "yaml", "java/c/c++/c#",
]);

function asColor(value: unknown): NotionColor | undefined {
  if (typeof value !== "string" || value === "default") return undefined;
  return (ALL_NOTION_COLORS as readonly string[]).includes(value) ? (value as NotionColor) : undefined;
}

function readRichText(items: RichTextItemResponse[] | undefined): RichText[] | undefined {
  if (!items || items.length === 0) return undefined;
  return items.map((item) => {
    if (item.type === "equation") {
      return { text: item.equation.expression, equation: item.equation.expression };
    }
    const run: RichText = { text: item.plain_text };
    const mark = item.annotations;
    if (mark.bold) run.bold = true;
    if (mark.italic) run.italic = true;
    if (mark.code) run.code = true;
    if (mark.underline) run.underline = true;
    if (mark.strikethrough) run.strikethrough = true;
    const color = asColor(mark.color);
    if (color) run.color = color;
    if (item.href) run.href = item.href;
    return run;
  });
}

type Textual = {
  rich_text: RichTextItemResponse[];
  color?: string;
};

function textual(block: BlockObjectResponse): Textual | undefined {
  switch (block.type) {
    case "paragraph":
    case "heading_1":
    case "heading_2":
    case "heading_3":
    case "heading_4":
    case "bulleted_list_item":
    case "numbered_list_item":
    case "to_do":
    case "toggle":
    case "quote":
    case "callout":
    case "code":
      return (block as unknown as Record<string, Textual>)[block.type];
    default:
      return undefined;
  }
}

export function fromNotionBlock(block: BlockObjectResponse): PolishBlock {
  if (block.type === "table_row") {
    const cells = block.table_row.cells.map((cell) =>
      cell.map((item) => (item.type === "equation" ? item.equation.expression : item.plain_text)).join(""),
    );
    return { id: block.id, type: "unsupported", originalType: "table_row", richText: [{ text: cells.join(" | ") }] };
  }
  if (!SUPPORTED.has(block.type)) {
    return { id: block.id, type: "unsupported", originalType: block.type };
  }

  const type = block.type as BlockType;
  const base: PolishBlock = { id: block.id, type };
  const body = textual(block);
  if (body) {
    base.richText = readRichText(body.rich_text);
    base.color = asColor(body.color);
  }

  if (block.type === "to_do") base.checked = block.to_do.checked;
  if (block.type === "code") base.language = block.code.language;
  if (block.type === "equation") base.expression = block.equation.expression;

  if (block.type === "callout" && block.callout.icon) {
    const icon = block.callout.icon;
    if (icon.type === "emoji") base.icon = { type: "emoji", emoji: icon.emoji };
    else if (icon.type === "external") base.icon = { type: "external", url: icon.external.url };
    else if (icon.type === "file") base.icon = { type: "external", url: icon.file.url };
  }

  if (block.type === "image") {
    const image = block.image;
    if (image.type === "external") base.url = image.external.url;
    else if (image.type === "file") base.url = image.file.url;
    base.caption = readRichText(image.caption);
  }

  if (block.type === "bookmark") {
    base.url = block.bookmark.url;
    base.caption = readRichText(block.bookmark.caption);
  }

  if (block.type === "code") base.caption = readRichText(block.code.caption);

  return base;
}

function pageTitle(page: PageObjectResponse): string {
  for (const property of Object.values(page.properties)) {
    if (property.type === "title") {
      return property.title.map((item) => item.plain_text).join("") || "未命名";
    }
  }
  return "未命名";
}

export function fromNotionPage(page: PageObjectResponse, blocks: PolishBlock[]): PolishPage {
  const result: PolishPage = { id: page.id, title: pageTitle(page), blocks, url: page.url };

  if (page.icon?.type === "emoji") result.icon = { type: "emoji", emoji: page.icon.emoji };
  else if (page.icon?.type === "external") result.icon = { type: "external", url: page.icon.external.url };
  else if (page.icon?.type === "file") result.icon = { type: "external", url: page.icon.file.url };

  if (page.cover?.type === "external") result.cover = page.cover.external.url;
  else if (page.cover?.type === "file") result.cover = page.cover.file.url;

  return result;
}

/** Notion rejects a single rich-text item longer than 2000 characters. */
const RICH_TEXT_LIMIT = 2000;

export function toRichText(runs: RichText[] | undefined): RichTextItemRequest[] {
  const source = runs && runs.length > 0 ? runs : [{ text: "" }];
  const out: RichTextItemRequest[] = [];

  for (const run of source) {
    if (run.equation !== undefined) {
      out.push({ type: "equation", equation: { expression: run.equation } });
      continue;
    }
    const chunks = run.text.length > 0 ? split(run.text, RICH_TEXT_LIMIT) : [""];
    for (const chunk of chunks) {
      out.push({
        type: "text",
        text: { content: chunk, link: run.href ? { url: run.href } : null },
        annotations: {
          bold: Boolean(run.bold),
          italic: Boolean(run.italic),
          strikethrough: Boolean(run.strikethrough),
          underline: Boolean(run.underline),
          code: Boolean(run.code),
          color: run.color ?? "default",
        },
      });
    }
  }

  return out;
}

function split(text: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

export function toLanguage(language: string | undefined): LanguageRequest {
  if (language && LANGUAGES.has(language)) return language as LanguageRequest;
  return "plain text";
}

type TextualRequest = {
  rich_text: RichTextItemRequest[];
  color?: NotionColor | "default";
};

/** Builds the request body for a block the toolkit itself created or recreated. */
export function toBlockRequest(block: PolishBlock): BlockObjectRequest {
  const text = (): TextualRequest => ({
    rich_text: toRichText(block.richText),
    color: block.color ?? "default",
  });

  switch (block.type) {
    case "paragraph":
      return { type: "paragraph", paragraph: text() };
    case "heading_1":
      return { type: "heading_1", heading_1: text() };
    case "heading_2":
      return { type: "heading_2", heading_2: text() };
    case "heading_3":
      return { type: "heading_3", heading_3: text() };
    case "heading_4":
      return { type: "heading_4", heading_4: text() };
    case "bulleted_list_item":
      return { type: "bulleted_list_item", bulleted_list_item: text() };
    case "numbered_list_item":
      return { type: "numbered_list_item", numbered_list_item: text() };
    case "to_do":
      return { type: "to_do", to_do: { ...text(), checked: Boolean(block.checked) } };
    case "toggle":
      return { type: "toggle", toggle: text() };
    case "quote":
      return { type: "quote", quote: text() };
    case "callout":
      return {
        type: "callout",
        callout: {
          ...text(),
          icon:
            block.icon?.type === "emoji"
              ? { type: "emoji", emoji: block.icon.emoji }
              : block.icon?.type === "external"
                ? { type: "external", external: { url: block.icon.url } }
                : undefined,
        },
      };
    case "code":
      return {
        type: "code",
        code: {
          rich_text: toRichText(block.richText),
          language: toLanguage(block.language),
          caption: block.caption ? toRichText(block.caption) : [],
        },
      };
    case "divider":
      return { type: "divider", divider: {} };
    case "table_of_contents":
      return { type: "table_of_contents", table_of_contents: { color: "default" } };
    case "breadcrumb":
      return { type: "breadcrumb", breadcrumb: {} };
    case "equation":
      return { type: "equation", equation: { expression: block.expression ?? "" } };
    case "bookmark":
      return {
        type: "bookmark",
        bookmark: { url: block.url ?? "https://www.notion.so", caption: toRichText(block.caption) },
      };
    case "image":
      return {
        type: "image",
        image: {
          type: "external",
          external: { url: block.url && /^https?:\/\//.test(block.url) ? block.url : "https://www.notion.so" },
          caption: toRichText(block.caption),
        },
      };
    case "column_list":
      return {
        type: "column_list",
        column_list: {
          children: (block.children ?? []).map((column) => ({
            type: "column" as const,
            column: {
              // Nested column children are a narrower request type than the
              // general block request. The paragraphs we put here satisfy it.
              children: (column.children ?? []).map((child) => toBlockRequest(child)),
            },
          })) as never,
        },
      };
    default:
      // Images, columns and unsupported blocks are never ones the toolkit creates.
      return { type: "paragraph", paragraph: text() };
  }
}
