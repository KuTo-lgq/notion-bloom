[English](./CONTRIBUTING.md) · [中文](./CONTRIBUTING.zh-CN.md)

# Contributing

This is for people changing this repository. To install Notion Bloom in your own agent, use the [README](README.md).

[Node.js](https://nodejs.org) 18 or newer. From a checkout:

```bash
npm install
npm test
```

`npm test` runs the fixture decks, the bad-input checks, and the install smoke test.

One deck on its own:

```bash
npx tsx scripts/check-deck.ts examples/fixtures/short.pptx
```

What each file is for: [examples/README.md](examples/README.md). GitHub Actions runs the same `npm test` on pull requests and on `main`.
