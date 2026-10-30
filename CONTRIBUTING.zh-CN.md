[English](./CONTRIBUTING.md) · [中文](./CONTRIBUTING.zh-CN.md)

# 参与开发

这份说明给改这个仓库的人。把 Notion Bloom 装进自己的助手，看 [中文说明](README.zh-CN.md)。

需要 [Node.js](https://nodejs.org) 18 或更高版本。在检出的目录里：

```bash
npm install
npm test
```

`npm test` 会跑夹具课件、坏输入，以及安装冒烟。

单独检查一份课件：

```bash
npx tsx scripts/check-deck.ts examples/fixtures/short.pptx
```

每个文件做什么见 [examples/README.md](examples/README.md)。GitHub Actions 在拉取请求和 `main` 上跑同一套 `npm test`。
