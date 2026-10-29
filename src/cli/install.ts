/**
 * Install the agent skill next to this repo.
 * Same idea as `npx impeccable install`: tools stay in the MCP, the prompt is for the agent.
 * This command does not call a model and does not publish a package.
 */

import path from "node:path";

import { BLOOM_PROMPT, WRITE_LECTURE_PROMPT } from "@/mcp/prompts";

import { installInto } from "./install-targets";

const SKILL = `---
name: notion-bloom
description: 用 Notion Bloom 把课件收成讲解页。Agent 自己写正文，MCP 只抽课件、审内容、写入和美化。要连接 Notion 时，先向用户要他自己的 integration token。
---

# Notion Bloom

MCP 不调用模型。你写讲解，工具负责抽字、截图、内容审、写入 Notion 和版式。要连接 Notion 时，先向用户要他自己的 integration token。

## 写讲解

${WRITE_LECTURE_PROMPT}

## 美化

${BLOOM_PROMPT}
`;

async function main() {
  const written = await installInto(process.cwd(), SKILL);
  for (const file of written) process.stdout.write(`Installed ${path.relative(process.cwd(), file)}\n`);
  process.stdout.write("Cursor, Claude Code, Codex, and DeepSeek Harness can launch notion-bloom. No model API is used.\n");
}

const entry = process.argv[1] ?? "";
if (entry.endsWith("install.ts") || entry.endsWith("install.js")) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exit(1);
  });
}
