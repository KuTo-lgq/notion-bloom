[English](./FAQ.md) · [中文](./FAQ.zh-CN.md)

# FAQ

Practical failures. The product path is still: the agent writes the lecture, Bloom reads the deck, checks it, writes Notion, then lays the page out.

## Notion token

A Notion login inside Cursor does not connect Bloom. Bloom uses the integration token you paste when the agent asks.

1. Open [Notion integrations](https://www.notion.so/my-integrations) and create an integration.
2. Copy the **Internal Integration Secret**. It starts with `ntn_` or `secret_`.
3. The agent stores it as `NOTION_TOKEN` in that client's MCP config. It is your secret: do not commit it and do not paste it in public.

## The page will not open

On the page you want to fill, choose **Share → Add connections** and add that same integration. Until you do, Bloom cannot open the page. Sharing the page with a person is not the same step.

Pages listed in `NOTION_BLOOM_DENY` are skipped. The default list is empty.

## Formula gaps

Bloom does not invent a formula it cannot read from the deck. Slide text is taken from the file. A formula that is only a picture, or that PDF text does not yield, stays marked 【公式缺】. Do not replace that mark with a look-alike expression.

A formula written as prose LaTeX (a `\frac` outside `$...$`) fails the content check. So does a broken KaTeX expression. Layout does not start while the check fails.

## Empty or bad decks

The deck must be a `.pdf` or `.pptx` that actually contains slides.

| Input | What you get |
| --- | --- |
| Empty file | Exits with `课件是空文件。` |
| Bytes that are not a pptx | Exits with `打不开课件：这不是有效的 .pptx。` |
| Wrong extension | Exits with `课件需要是 .pdf 或 .pptx。` |
| Missing path | Exits with `找不到课件：` and the path |

```bash
npx tsx scripts/check-deck.ts examples/fixtures/empty.pptx
```

That process exits 1 and prints one line. It does not hang. Sample files are listed in [examples/README.md](../examples/README.md).

Screenshots of whole slides need LibreOffice (`soffice`) and PyMuPDF. Without them, Bloom still reads the text. It does not draw a fake slide. A figure the lecture needs and the deck did not render is 【图缺】, or the content check fails until the draft says so.

## Install

[Node.js](https://nodejs.org) 18 or newer, in the project the agent is working in:

```bash
npx notion-bloom install
```

Or tell the agent: “Install Notion Bloom MCP from npm (`notion-bloom`). Run `npx notion-bloom install`, or wire the MCP the way the package documents.”

Reopen the agent afterward. Codex reads the project config only after you mark the project trusted. DeepSeek Harness reads it the next time you open it.

The MCP entry runs `npx --no-install notion-bloom`. That does not download the package. `npx notion-bloom install` is what installs it. GitHub (`npx github:KuTo-lgq/notion-bloom install`) and a clone are alternatives, not the first step. See the [README](../README.md).

## Permissions

The integration can only see pages you connected. A token from someone else, or a token for a workspace the page is not in, will not open the page. Bloom does not ask Notion for a login on your behalf.
