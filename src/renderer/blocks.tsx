/**
 * The Notion renderer.
 *
 * One component tree serves two consumers: the playground's side-by-side
 * preview, and the PNG an agent looks at through the `preview_page` MCP tool.
 * Sharing it is the point — the picture the agent reasons about is literally
 * the picture a human sees.
 *
 * Pure and hook-free so it can also run through `renderToStaticMarkup`.
 */

import type { JSX } from "react";

import { flatten, headingLevel, plainText } from "@/core/text";
import type { PolishBlock, PolishPage, RichText } from "@/core/types";

import { colorStyle } from "./css";

export type RenderOptions = {
  /** Blocks an op modified in place — marked with a blue rail. */
  changedIds?: string[];
  /** Blocks an op inserted — marked with a green rail. */
  addedIds?: string[];
  /** Tints changed blocks so a diff reads at a glance. */
  annotate?: boolean;
};

function Inline({ runs }: { runs?: RichText[] }) {
  if (!runs || runs.length === 0) return null;
  return (
    <>
      {runs.map((run, i) => {
        if (run.text === "") return null;
        let node: JSX.Element = <span style={colorStyle(run.color)}>{run.text}</span>;
        if (run.code) node = <code className="np-code-inline">{run.text}</code>;
        if (run.bold) node = <strong>{node}</strong>;
        if (run.italic) node = <em>{node}</em>;
        if (run.underline) node = <u>{node}</u>;
        if (run.strikethrough) node = <s>{node}</s>;
        if (run.href) {
          node = (
            <a className="np-link" href={run.href}>
              {node}
            </a>
          );
        }
        return <span key={i}>{node}</span>;
      })}
    </>
  );
}

function changeState(
  block: PolishBlock,
  options: RenderOptions,
): "true" | "added" | undefined {
  if (options.addedIds?.includes(block.id)) return "added";
  if (options.changedIds?.includes(block.id)) return "true";
  return undefined;
}

/** Notion renders its TOC block from the page's own headings. */
function TableOfContents({ page }: { page: PolishPage }) {
  const headings = flatten(page.blocks).filter((b) => {
    const level = headingLevel(b);
    return level === 1 || level === 2 || level === 3;
  });
  if (headings.length === 0) {
    return <div className="np-toc np-toc-empty">目录（页面暂无标题）</div>;
  }
  return (
    <div className="np-toc">
      {headings.map((h) => (
        <div key={h.id} className="np-toc-item" data-level={headingLevel(h)}>
          {plainText(h.richText)}
        </div>
      ))}
    </div>
  );
}

function BlockBody({
  block,
  page,
  ordinal,
}: {
  block: PolishBlock;
  page: PolishPage;
  ordinal: number;
}) {
  const style = colorStyle(block.color);

  switch (block.type) {
    case "heading_1":
      return (
        <h1 className="np-h1" style={style}>
          <Inline runs={block.richText} />
        </h1>
      );
    case "heading_2":
      return (
        <h2 className="np-h2" style={style}>
          <Inline runs={block.richText} />
        </h2>
      );
    case "heading_3":
      return (
        <h3 className="np-h3" style={style}>
          <Inline runs={block.richText} />
        </h3>
      );
    case "heading_4":
      return (
        <h4 className="np-h4" style={style}>
          <Inline runs={block.richText} />
        </h4>
      );

    case "bulleted_list_item":
      return (
        <div className="np-li" style={style}>
          <span className="np-li-marker">
            <span className="np-li-bullet-dot" />
          </span>
          <div className="np-li-content">
            <Inline runs={block.richText} />
          </div>
        </div>
      );

    case "numbered_list_item":
      return (
        <div className="np-li" style={style}>
          <span className="np-li-marker">{ordinal}.</span>
          <div className="np-li-content">
            <Inline runs={block.richText} />
          </div>
        </div>
      );

    case "to_do":
      return (
        <div className="np-li" style={style}>
          <span className="np-li-marker">
            <span className="np-checkbox" data-checked={block.checked ? "true" : "false"} />
          </span>
          <div className={`np-li-content${block.checked ? " np-checked-text" : ""}`}>
            <Inline runs={block.richText} />
          </div>
        </div>
      );

    case "toggle":
      return (
        <div className="np-toggle" style={style}>
          <div className="np-toggle-head">
            <span className="np-toggle-arrow">▶</span>
            <div className="np-li-content">
              <Inline runs={block.richText} />
            </div>
          </div>
        </div>
      );

    case "callout":
      return (
        <div className="np-callout" style={style}>
          <span className="np-callout-icon">
            {block.icon?.type === "emoji" ? block.icon.emoji : block.icon ? "🖼" : ""}
          </span>
          <div className="np-callout-body">
            <Inline runs={block.richText} />
          </div>
        </div>
      );

    case "quote":
      return (
        <blockquote className="np-quote" style={style}>
          <Inline runs={block.richText} />
        </blockquote>
      );

    case "code": {
      const isPlain = !block.language || /^plain ?text$/i.test(block.language);
      return (
        <div className="np-code">
          <span className="np-code-lang" data-plain={isPlain ? "true" : "false"}>
            {block.language || "plain text"}
          </span>
          <pre>{plainText(block.richText)}</pre>
          {block.caption?.length ? (
            <div className="np-caption">
              <Inline runs={block.caption} />
            </div>
          ) : null}
        </div>
      );
    }

    case "divider":
      return <div className="np-divider" />;

    case "table_of_contents":
      return <TableOfContents page={page} />;

    case "image":
      return (
        <div className="np-image">
          {block.url ? (
            <img src={block.url} alt={plainText(block.caption) || ""} />
          ) : (
            <div className="np-image-placeholder">图片</div>
          )}
          {block.caption?.length ? (
            <div className="np-caption">
              <Inline runs={block.caption} />
            </div>
          ) : null}
        </div>
      );

    case "bookmark":
      return (
        <div className="np-bookmark">
          <div>
            <Inline runs={block.caption} />
          </div>
          <div className="np-bookmark-url">{block.url}</div>
        </div>
      );

    case "breadcrumb":
      return <div className="np-breadcrumb">· · ·</div>;

    case "equation":
      return <div className="np-equation">{block.expression ?? plainText(block.richText)}</div>;

    case "column_list":
    case "column":
      // Columns are containers; children render through the generic path.
      return null;

    case "paragraph":
      return (
        <div className="np-p" style={style}>
          <Inline runs={block.richText} />
        </div>
      );

    case "unsupported":
      return <div className="np-unsupported">{block.originalType ?? "unsupported"}（原样保留）</div>;

    default: {
      const exhaustive: never = block.type;
      return <div className="np-unsupported">{String(exhaustive)}</div>;
    }
  }
}

function listOrdinals(blocks: PolishBlock[]): number[] {
  let current = 0;
  return blocks.map((block) => {
    if (block.type !== "numbered_list_item") {
      current = 0;
      return 0;
    }
    current += 1;
    return current;
  });
}

function Blocks({
  blocks,
  page,
  options,
}: {
  blocks: PolishBlock[];
  page: PolishPage;
  options: RenderOptions;
}) {
  const ordinals = listOrdinals(blocks);
  return (
    <>
      {blocks.map((block, index) => {
        const ordinal = ordinals[index] ?? 0;

        if (block.type === "column_list") {
          return (
            <div
              key={block.id}
              className="np-block"
              data-changed={changeState(block, options)}
              style={{ display: "flex", gap: 24, margin: "4px 0" }}
            >
              {(block.children ?? []).map((column) => (
                <div key={column.id} style={{ flex: 1, minWidth: 0 }}>
                  <Blocks blocks={column.children ?? []} page={page} options={options} />
                </div>
              ))}
            </div>
          );
        }

        const hasOwnChildren = Boolean(block.children?.length) && block.type !== "column";

        return (
          <div key={block.id} className="np-block" data-changed={changeState(block, options)}>
            <BlockBody block={block} page={page} ordinal={ordinal} />
            {hasOwnChildren ? (
              <div className={block.type === "toggle" ? "np-toggle-children" : "np-children"}>
                <Blocks blocks={block.children ?? []} page={page} options={options} />
              </div>
            ) : null}
          </div>
        );
      })}
    </>
  );
}

export function NotionPreview({
  page,
  options = {},
}: {
  page: PolishPage;
  options?: RenderOptions;
}) {
  return (
    <div className="np-root" data-annotate={options.annotate ? "true" : "false"}>
      {page.cover ? (
        <div className="np-cover" style={{ backgroundImage: `url(${page.cover})` }} />
      ) : (
        <div className="np-cover-empty" />
      )}
      <div className="np-header">
        {page.icon ? (
          <div className="np-page-icon" style={page.cover ? undefined : { marginTop: 0 }}>
            {page.icon.type === "emoji" ? (
              page.icon.emoji
            ) : (
              <img src={page.icon.url} alt="" width={72} height={72} />
            )}
          </div>
        ) : (
          <div className="np-page-icon np-page-icon-empty" />
        )}
        <h1 className="np-title">{page.title}</h1>
      </div>
      <div className="np-body">
        <Blocks blocks={page.blocks} page={page} options={options} />
      </div>
    </div>
  );
}
