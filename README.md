[English](./README.md) · [中文](./README.zh-CN.md)

# Notion Bloom

**PPT → Notion lecture notes**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/notion-bloom)](https://www.npmjs.com/package/notion-bloom)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org)

Turn a PDF or PPTX into a Notion lecture you can read, with the layout already set.

Your coding agent writes the lecture. Bloom is the MCP server next to it: tools that extract text and the figures the lecture needs, a content check, a write into Notion, and a layout pass for headings, callouts, cover, and color. Prompts tell the agent how to call those tools. The model call stays in your agent. Bloom does not call a model API, and it is not a website.

It installs into the agent you already use: Cursor, Claude Code, Codex, or DeepSeek Harness. The published package is [notion-bloom on npm](https://www.npmjs.com/package/notion-bloom).

## Install

[Node.js](https://nodejs.org) 18 or newer. In the project your agent is working in:

```bash
npx notion-bloom install
```

That installs [notion-bloom](https://www.npmjs.com/package/notion-bloom) from npm and registers the skill and the MCP entry for Cursor, Claude Code, Codex, and DeepSeek Harness. Reopen the agent when it finishes.

- **Codex** loads the project config after you mark the project trusted.
- **DeepSeek Harness** picks up the new config the next time you open it.

### Alternatives

GitHub:

```bash
npx github:KuTo-lgq/notion-bloom install
```

Clone:

```bash
git clone https://github.com/KuTo-lgq/notion-bloom.git
cd notion-bloom
npm install
npx notion-bloom install
```

## Notion token

Bloom uses an integration token you give the agent. A Notion login inside Cursor does not connect it.

1. Open [Notion integrations](https://www.notion.so/my-integrations) and create an integration.
2. Copy the **Internal Integration Secret**. It starts with `ntn_` or `secret_`.
3. Paste it when the agent asks. The agent stores it as `NOTION_TOKEN` in that client's MCP config. It is your secret: keep it out of git and out of public places.
4. On the page you want to fill, choose **Share → Add connections** and add that integration. Until you do, Bloom cannot open the page.

## Usage

After `npx notion-bloom install`, give the agent a PDF or PPTX, the language, and the Notion page. For example:

- “Write this lecture in English from this deck, and put it on my Notion page.”
- 「用这份 pdf，用中文写一篇讲解，放到我这个 Notion 页面下。」
- 「这一页内容已经对了，只排版，不要改句子和公式。」

| Step | Who |
| --- | --- |
| Extract text, and the screenshots the lecture needs | Bloom |
| Write the lecture | Your agent |
| Check that a reader can follow it step by step | Bloom |
| Write the page to Notion | Bloom |
| Set headings, callouts, cover, and color | Bloom |

Numbers and formulas stay as they appear on the slides. A formula the deck does not yield is marked 【公式缺】. Layout starts after the content check passes.

## License

[MIT](LICENSE)
