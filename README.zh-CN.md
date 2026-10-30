[English](./README.md) · [中文](./README.zh-CN.md)

# Notion Bloom

**课件 → 讲解正文 → Notion 排版。给编程助手用的 MCP：工具和提示词，不调用大模型接口。**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/notion-bloom)](https://www.npmjs.com/package/notion-bloom)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org)

把一份 PDF 或 PPTX 收成一页能读的 Notion 讲解，并排好版式。

编程助手写正文。Bloom 是旁边的 MCP 服务：工具负责抽出文字和讲解需要的截图、做内容检查、写入 Notion，再调整标题、提示框、封面和颜色。提示词告诉助手怎么调用这些工具。模型调用留在你的助手里。Bloom 不调用大模型接口，也不是一个网站。

它装进你已经在用的助手：Cursor、Claude Code、Codex 或 DeepSeek Harness。已发布的包是 [npm 上的 notion-bloom](https://www.npmjs.com/package/notion-bloom)。

## 最短路径

示例课件：[examples/fixtures/short.pptx](examples/fixtures/short.pptx)（三页）。一份真实讲解课件是 [examples/bayes-lecture.pptx](examples/bayes-lecture.pptx)。每个文件做什么见 [examples/README.md](examples/README.md)。

在助手正在工作的项目目录里：

```bash
npx notion-bloom install
```

也可以对助手说：「从 npm 安装 Notion Bloom MCP（包名 `notion-bloom`）。」

重新打开助手，然后说：

> 用 examples/fixtures/short.pptx，用中文写一篇讲解，放到我这个 Notion 页面下。

助手要 token 时，贴上你自己的 integration secret，并在目标页面选 **Share → Add connections**。助手写正文。Bloom 读课件、检查能不能一步步读下去、写入 Notion，再调整标题、提示框、封面和颜色。课件上的数字和公式按原样留下。课件里读不出的式子标成【公式缺】。内容检查通过之后才排版。检查没过不会写入，除非你明确要求先存一份待审稿，而那一页不会被美化。

常见问题：[FAQ](docs/FAQ.zh-CN.md)。

## 安装

需要 [Node.js](https://nodejs.org) 18 或更高版本。在助手正在工作的项目目录里执行：

```bash
npx notion-bloom install
```

这条命令从 [npm](https://www.npmjs.com/package/notion-bloom) 安装 notion-bloom，并为 Cursor、Claude Code、Codex 和 DeepSeek Harness 写入技能和 MCP 入口。完成后重新打开助手。

### 让助手安装

不必自己跑命令。在同一个项目里对助手说：

> 从 npm 安装 Notion Bloom MCP（包名 `notion-bloom`）。请执行 `npx notion-bloom install`，或按包文档接入 MCP。

助手会安装这个包，并写入技能和 MCP 入口。

- **Codex** 要先把项目标成受信任，项目里的配置才会生效。
- **DeepSeek Harness** 在下一次打开时读到新配置。

### 其他方式

GitHub：

```bash
npx github:KuTo-lgq/notion-bloom install
```

克隆：

```bash
git clone https://github.com/KuTo-lgq/notion-bloom.git
cd notion-bloom
npm install
npx notion-bloom install
```

## Notion 令牌

Bloom 使用你交给助手的 integration token。在 Cursor 里登录过 Notion，并不等于已经连上。

1. 打开 [Notion integrations](https://www.notion.so/my-integrations)，新建一个 integration。
2. 复制 **Internal Integration Secret**。它以 `ntn_` 或 `secret_` 开头。
3. 助手询问时把这串密钥贴给它。助手把它写成当前客户端 MCP 配置里的 `NOTION_TOKEN`。这是你自己的密钥，不要提交，也不要发到公开的地方。
4. 打开要写入的页面，选择 **Share → Add connections**，把这个 integration 加进去。少了这一步，Bloom 打不开页面。

## 使用

装好 Notion Bloom 之后，把 PDF 或 PPTX 交给助手，并说明语言和目标页面。例如：

- 「用这份 pdf，用中文写一篇讲解，放到我这个 Notion 页面下。」
- “Write this lecture in English from this deck, and put it on my Notion page.”
- 「这一页内容已经对了，只排版，不要改句子和公式。」

| 步骤 | 谁来做 |
| --- | --- |
| 抽出文字，以及讲解需要的截图 | Bloom |
| 写讲解正文 | 你的助手 |
| 检查能不能一步步读下去 | Bloom |
| 写入 Notion | Bloom |
| 调整标题、提示框、封面和颜色 | Bloom |

课件上的数字和公式按原样留下。课件里读不出的式子标成【公式缺】。内容检查通过之后，才开始排版。

## 许可证

[MIT](LICENSE)

改这个仓库？见 [CONTRIBUTING.md](CONTRIBUTING.zh-CN.md)。
