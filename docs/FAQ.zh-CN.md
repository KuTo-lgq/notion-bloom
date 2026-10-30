[English](./FAQ.md) · [中文](./FAQ.zh-CN.md)

# 常见问题

这里只写真正会卡住的地方。路径不变：助手写讲解，Bloom 读课件、检查、写入 Notion，再排版。

## Notion 令牌

在 Cursor 里登录过 Notion，并不等于 Bloom 已连上。Bloom 只用你交给助手的 integration token。

1. 打开 [Notion integrations](https://www.notion.so/my-integrations)，新建一个 integration。
2. 复制 **Internal Integration Secret**。它以 `ntn_` 或 `secret_` 开头。
3. 助手把它写成当前客户端 MCP 配置里的 `NOTION_TOKEN`。这是你自己的密钥，不要提交，也不要发到公开的地方。

## 页面打不开

在要写入的页面上选择 **Share → Add connections**，把同一个 integration 加进去。少了这一步，Bloom 打不开页面。把页面分享给某个人，并不是这一步。

列在 `NOTION_BLOOM_DENY` 里的页面会被跳过。默认是空的。

## 公式读不出来

Bloom 不会替课件编一个它没读到的公式。正文来自文件里的文字。只是一张图、或 PDF 里抽不出的式子，保持【公式缺】。不要换成一个看起来像的表达式。

散文里的伪 LaTeX（`$...$` 外面的 `\frac`）过不了内容检查。坏掉的 KaTeX 也一样。检查没过，不会先排版。

## 空课件和坏文件

课件必须是真有幻灯片的 `.pdf` 或 `.pptx`。

| 输入 | 结果 |
| --- | --- |
| 空文件 | 退出并打印 `课件是空文件。` |
| 不是 pptx 的字节 | 退出并打印 `打不开课件：这不是有效的 .pptx。` |
| 扩展名不对 | 退出并打印 `课件需要是 .pdf 或 .pptx。` |
| 路径不存在 | 退出并打印 `找不到课件：` 和那个路径 |

```bash
npx tsx scripts/check-deck.ts examples/fixtures/empty.pptx
```

进程以状态 1 结束，只打一行，不会卡住。样例文件见 [examples/README.md](../examples/README.md)。

整页截图需要 LibreOffice（`soffice`）和 PyMuPDF。没有它们时，Bloom 仍然读文字，不会画一张假的幻灯片。讲解需要、课件又没渲出来的图，标成【图缺】，或者内容检查不通过，直到草稿里写明。

## 安装

需要 [Node.js](https://nodejs.org) 18 或更高版本。在助手正在工作的项目目录里：

```bash
npx notion-bloom install
```

也可以对助手说：「从 npm 安装 Notion Bloom MCP（包名 `notion-bloom`）。请执行 `npx notion-bloom install`，或按包文档接入 MCP。」

装完后重新打开助手。Codex 要先把项目标成受信任，项目里的配置才会生效。DeepSeek Harness 在下一次打开时读到新配置。

MCP 入口运行的是 `npx --no-install notion-bloom`，它不会再去下载包。安装靠的是 `npx notion-bloom install`。GitHub（`npx github:KuTo-lgq/notion-bloom install`）和克隆是备选，不是第一步。见 [中文说明](../README.zh-CN.md)。

## 权限

Integration 只能看见你加过连接的页面。别人的 token，或另一个工作区的 token，都打不开这一页。Bloom 不会替你向 Notion 要一次登录。
