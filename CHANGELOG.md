# Changelog

## Unreleased

内容审对一整讲课件不再只查跳步和坏公式。下面这些情况直接 Fail，对应 Pipeline L03 比正式讲解薄的地方。

| Fail | 拦住什么 |
| --- | --- |
| `missing_citation` | 大节没有「PPT 第 n 页」或「第 n/N 页」 |
| `missing_worked_example` | 课件上的手算小数没有写进讲解 |
| `double_number` | 编号列表的文字又写了「1.」，页面变成「1. 1.」 |
| `missing_self_test` | 整讲没有自测或考试要点 |
| `missing_figure` | 约 50 页以上的课件真实截图少于 8 张 |
| `thin_coverage` | 小批量、epoch、学习率日程被压成一小节 |
| `thin_self_test` | 带过程的自测少于 5 题，或考试要点不足 5 条 |
| `thin_research` | Adam 研究时间线没有写开到至少三篇论文、三个年份 |
| `missing_interactive_calc` | 交互页没把更新后的权重和新损失按步算出来并标【补充·手算】 |
| `fragmented_outline` | 一级标题超过 14 个 |
| `monolingual_heading` | 仅当草稿 `locale` 为 `bilingual`：标题没有同时出现两种文字。默认不查 |
| `missing_usage_note` | 没有短的页码使用说明 |
| `missing_cross_lecture` | 仅双语档：前后讲没有至少三行的联系表。默认不要求 |
| `thin_derivation` | 链式法则、反向传播、手算、动量、自适应方法这些大节只有提纲，没有逐步推导 |
| `over_fragmented_h2` | 50 页以上的课件露出的二级标题超过 28 个 |
| `missing_bilingual_example` | 仅双语档：课件原句没有放进带另一种语言的例题框。默认不强制翻译 |
| `missing_comparison` | 多种优化器没有一张至少四行的对照表 |
| `wrong_claim` | 把 Zhang 的条件写成 β₁ < β₂，而不是 β₁ < √β₂ |
| `example_drift` | 分叉例子改成了另一道题；长小数不在课件里又没标【补充】 |
| `missing_update` | 课件有一步更新，讲解没写出更新后的权重和新损失 |
| `missing_step_names` | 丢掉课件上的 Sample / Differentiate / Remember / Update |
| `missing_practice_code` | 课件要求清梯度，讲解没有 zero_grad |
| `thin_pseudocode` | 小批量算法步骤少于四步 |
| `thin_adam` | Adam 没写清从 0 开始所以要除以 1−β^{k+1} |
| `leaked_escape` | 正文里的 `\_`、`\^`，以及 `w_0` 这种没放进公式的下标 |

`audit_formulas` 会标出写成 β₁ < β₂ 的公式。`audit_structure` 对长页同样 Fail：`double-number`、`leaked-escape`、`missing-ppt-citation`、`missing-self-test`、`thin-self-test`、`thin-research`、`fragmented-outline`、`wrong-claim`、`missing-optimizer-comparison`（没有对照表）。

课程页封面改用插图，不再从纯米色里抽。讲解语言跟用户的提示词走。要双语门禁时，在草稿里写 `locale: "bilingual"`。验收跟着眼前这份课件走，不附带某一门课的固定清单。

短课件（不到 40 页）不跑这组长讲规则，避免把三页练习册误判。
