# Notion Bloom

PPT → Notion lecture notes

课件 → Notion 讲解

把一份课件做成一页能读的 Notion 讲解，并排好版式。

你准备好 pdf 或 pptx，告诉编程助手用什么语言写、放到哪个 Notion 页面。助手写正文。Bloom 从课件里抽出文字和需要的截图，检查这篇讲解能不能一步步读下去，通过之后写入 Notion，再调整标题、提示框、封面和颜色。

Bloom 不自己调用大模型，也不是一个网站。它装在你已经在用的编程助手里：Cursor、Claude Code、Codex 或 DeepSeek Harness。

## 安装

先安装 [Node.js](https://nodejs.org)。在你要使用 Bloom 的项目目录里执行：

```bash
npx github:KuTo-lgq/notion-bloom install
```

这条命令从公开的 GitHub 仓库安装 Bloom，并把它登记给当前项目里的编程助手。这个包没有发布到 npm。

也可以先把仓库克隆下来，再在那个文件夹里安装：

```bash
git clone https://github.com/KuTo-lgq/notion-bloom.git
cd notion-bloom
npm install
npx notion-bloom install
```

`npm install` 安装运行所需的依赖。`npx notion-bloom install` 把 Bloom 登记给当前项目里的编程助手。

装完后重新打开助手。Codex 要先把这个项目标成受信任，项目里的配置才会生效。DeepSeek Harness 改完配置后，重新打开一次。

## 使用

在助手里直接说你要什么，并把课件给它。例如：

- 「用这份 pdf，用中文写一篇讲解，放到我这个 Notion 页面下。」
- “Write this lecture in English from this deck, and put it on my Notion page.”
- 「这一页内容已经对了，只排版，不要改句子和公式。」

要写入 Notion 时，助手会先问你要 token。打开 [Notion integrations](https://www.notion.so/my-integrations)，新建一个 integration，复制 Internal Integration Secret。它以 `ntn_` 或 `secret_` 开头。把这串密钥贴给助手。这是你自己的密钥，不要用别人的，也不要发到公开的地方。

在 Cursor 或其他软件里登录过 Notion，不等于 Bloom 已经连上。Bloom 只认你交给助手的这串密钥。

助手还会让你打开要写入的页面，点 Share，再点 Add connections，把刚才那个 integration 加进去。没有这一步，页面会打不开。

写出来的讲解对着你给的那份课件。课件上的数字和公式会按原样留下来；课件里读不出的式子会标成【公式缺】，不会另编一个。内容还经不起读的时候，不会先去做排版。

[MIT](LICENSE)
