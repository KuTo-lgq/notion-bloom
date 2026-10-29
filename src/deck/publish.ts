/**
 * Creates one Notion page for a generated lecture and uploads its figures.
 */

import { readFile } from "node:fs/promises";

import type { BlockObjectRequest, Client } from "@notionhq/client";

import type { LectureBlock } from "./compose";
import { createPacer } from "@/notion/pace";

function textItem(content: string) {
  return [{ type: "text" as const, text: { content: content.slice(0, 1800) } }];
}

function toRequest(block: Exclude<LectureBlock, { kind: "image" }>): BlockObjectRequest {
  switch (block.kind) {
    case "heading_1":
      return { type: "heading_1", heading_1: { rich_text: textItem(block.text) } };
    case "heading_2":
      return { type: "heading_2", heading_2: { rich_text: textItem(block.text) } };
    case "paragraph":
      return { type: "paragraph", paragraph: { rich_text: textItem(block.text) } };
    case "equation":
      return { type: "equation", equation: { expression: block.expression } };
    case "bulleted_list_item":
      return { type: "bulleted_list_item", bulleted_list_item: { rich_text: textItem(block.text) } };
    case "callout":
      return {
        type: "callout",
        callout: {
          rich_text: textItem(block.text),
          icon: { type: "emoji", emoji: block.emoji },
          color: block.color,
        },
      };
    case "divider":
      return { type: "divider", divider: {} };
    case "table_of_contents":
      return { type: "table_of_contents", table_of_contents: { color: "gray" } };
    default: {
      const exhaustive: never = block;
      throw new Error(`未知块：${JSON.stringify(exhaustive)}`);
    }
  }
}

async function uploadImage(client: Client, paced: ReturnType<typeof createPacer>, file: string): Promise<string> {
  const bytes = await readFile(file);
  const filename = file.split("/").pop() ?? "slide.jpg";
  const contentType = filename.endsWith(".png") ? "image/png" : "image/jpeg";
  const created = await paced(() =>
    client.fileUploads.create({ mode: "single_part", filename, content_type: contentType }),
  );
  await paced(() =>
    client.fileUploads.send({
      file_upload_id: created.id,
      file: { filename, data: new Blob([new Uint8Array(bytes)], { type: contentType }) },
    }),
  );
  return created.id;
}

export async function publishLecture(options: {
  client: Client;
  parentPageId: string;
  title: string;
  blocks: LectureBlock[];
}): Promise<{ id: string; url: string }> {
  const { client, parentPageId, title, blocks } = options;
  const paced = createPacer();
  const created = await paced(() =>
    client.pages.create({
      parent: { page_id: parentPageId },
      properties: { title: { title: textItem(title) } },
      icon: { type: "emoji", emoji: "📘" },
    }),
  );
  const pageId = created.id;
  const url = "url" in created && typeof created.url === "string" ? created.url : `https://www.notion.so/${pageId.replace(/-/g, "")}`;

  let buffer: BlockObjectRequest[] = [];
  const flush = async () => {
    while (buffer.length > 0) {
      const chunk = buffer.slice(0, 40);
      buffer = buffer.slice(40);
      await paced(() => client.blocks.children.append({ block_id: pageId, children: chunk }));
    }
  };

  for (const block of blocks) {
    if (block.kind === "image") {
      await flush();
      const uploadId = await uploadImage(client, paced, block.file);
      await paced(() =>
        client.blocks.children.append({
          block_id: pageId,
          children: [
            {
              type: "image",
              image: {
                type: "file_upload",
                file_upload: { id: uploadId },
                caption: textItem(block.caption),
              },
            },
          ],
        }),
      );
      continue;
    }
    buffer.push(toRequest(block));
  }
  await flush();
  return { id: pageId, url };
}
