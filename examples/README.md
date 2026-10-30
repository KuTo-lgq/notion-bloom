# Examples

[English](../README.md) · [中文](../README.zh-CN.md) · [FAQ](../docs/FAQ.md) · [常见问题](../docs/FAQ.zh-CN.md)

Decks for the shortest-path demo and for `npm test`. They stay small on purpose.

| File | What it is for |
| --- | --- |
| [fixtures/short.pptx](fixtures/short.pptx) | Three-slide synthetic deck. This is the demo file in the README, and the one-deck check: `npx tsx scripts/check-deck.ts examples/fixtures/short.pptx`. |
| [fixtures/mini-deck.pptx](fixtures/mini-deck.pptx) | Longer synthetic lesson, 12 slides (~11 KB). Regression: ingest and the content gate must not throw. |
| [fixtures/empty.pptx](fixtures/empty.pptx) | Zero-byte file. `check-deck` exits 1 with `课件是空文件。` |
| [fixtures/not-a-deck.pptx](fixtures/not-a-deck.pptx) | Not a zip. Exits 1 with `打不开课件：这不是有效的 .pptx。` |
| [fixtures/not-a-deck.txt](fixtures/not-a-deck.txt) | Wrong extension. Exits 1 with `课件需要是 .pdf 或 .pptx。` |
| [bayes-lecture.pptx](bayes-lecture.pptx) | Real Bayes lecture (3 slides, larger file). Use it when the demo should be a real deck rather than the synthetic `short.pptx`. Also in the regression suite. |

[`fixtures/lesson-step.pptx`](../fixtures/lesson-step.pptx) is the small deck the pipeline script uses (`npx tsx scripts/run-lecture-pipeline.ts --pptx ./fixtures/lesson-step.pptx`). The same regression ingests it.

## 示例

给最短路径和 `npm test` 用的课件，体积刻意很小。

| 文件 | 用途 |
| --- | --- |
| [fixtures/short.pptx](fixtures/short.pptx) | 三页合成课件。README 里的演示文件，也用于 `npx tsx scripts/check-deck.ts examples/fixtures/short.pptx`。 |
| [fixtures/mini-deck.pptx](fixtures/mini-deck.pptx) | 稍长的合成讲解，12 页（约 11 KB）。回归：读取和内容检查不能抛错。 |
| [fixtures/empty.pptx](fixtures/empty.pptx) | 空文件。`check-deck` 以状态 1 退出，并打印 `课件是空文件。` |
| [fixtures/not-a-deck.pptx](fixtures/not-a-deck.pptx) | 不是 zip。以状态 1 退出，并打印 `打不开课件：这不是有效的 .pptx。` |
| [fixtures/not-a-deck.txt](fixtures/not-a-deck.txt) | 扩展名不对。以状态 1 退出，并打印 `课件需要是 .pdf 或 .pptx。` |
| [bayes-lecture.pptx](bayes-lecture.pptx) | 真实的贝叶斯讲解（3 页，文件更大）。演示想用真实课件、而不是合成的 `short.pptx` 时用它。回归也会读它。 |

[`fixtures/lesson-step.pptx`](../fixtures/lesson-step.pptx) 是流水线脚本用的短课件（`npx tsx scripts/run-lecture-pipeline.ts --pptx ./fixtures/lesson-step.pptx`）。同一组回归也会读取它。
