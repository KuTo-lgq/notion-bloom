[English](./README.md) · [中文](./README.zh-CN.md)

# Notion Bloom

**课件 → Notion 讲解**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org)

把一份 PDF 或 PPTX 收成一页能读的 Notion 讲解，并排好版式。

编程助手写正文。Bloom 是旁边的 MCP 服务：工具负责抽出文字和讲解需要的截图、做内容检查、写入 Notion，再调整标题、提示框、封面和颜色。提示词告诉助手怎么调用这些工具。模型调用留在你的助手里。Bloom 不调用大模型接口，也不是一个网站。

它装进你已经在用的助手：Cursor、Claude Code、Codex 或 DeepSeek Harness。这个包没有发布到 npm（`private: true`）。

## 安装

需要 [Node.js](https://nodejs.org) 18 或更高版本。在助手正在工作的项目目录里执行：

```bash
npx github:KuTo-lgq/notion-bloom install
```

这条命令会为 Cursor、Claude Code、Codex 和 DeepSeek Harness 写入技能和 MCP 入口。完成后重新打开助手。

- **Codex** 要先把项目标成受信任，项目里的配置才会生效。
- **DeepSeek Harness** 在下一次打开时读到新配置。

### 从克隆安装

```bash
git clone https://github.com/KuTo-lgq/notion-bloom.git
cd notion-bloom
npm install
npx notion-bloom install
```

`npm install` 安装依赖。`npx notion-bloom install` 写入同一套技能和 MCP 入口。两条命令都在这个文件夹里执行。包没有上 npm，换一个空目录找不到它。

## Notion 令牌

Bloom 使用你交给助手的 integration token。在 Cursor 里登录过 Notion，并不等于已经连上。

1. 打开 [Notion integrations](https://www.notion.so/my-integrations)，新建一个 integration。
2. 复制 **Internal Integration Secret**。它以 `ntn_` 或 `secret_` 开头。
3. 助手询问时把这串密钥贴给它。助手把它写成当前客户端 MCP 配置里的 `NOTION_TOKEN`。这是你自己的密钥，不要提交，也不要发到公开的地方。
4. 打开要写入的页面，选择 **Share → Add connections**，把这个 integration 加进去。少了这一步，Bloom 打不开页面。

## 使用

把 PDF 或 PPTX 交给助手，并说明语言和目标页面。例如：

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
