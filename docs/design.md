# Notion Bloom 设计

产品是一条流水线，不是单独一个美化工具：

**Agent 写讲解，MCP 抽课件、审内容、写入 Notion、再美化。** MCP 不调用模型。

美化（bloom）是最后一环。内容不对或不完整，禁止当定稿，也禁止先美化。

跳步 = Fail。无推导的复杂公式 = Fail。内容未过关就美化 = Fail。

讲解按初学者来写：具体、不跳步、复杂公式把中间行写全；正确、完整、详细、通俗，同时言简意赅；该举例就举例；考点用小图标或提示框；需要课件图就从幻灯片截进正文，没有图就写【图缺】；行内公式用 `$...$`，独立公式单独成行，禁止散文里的伪 LaTeX。普通讲义不附英文书写版。页首是短主线加目录，少用表格，不放长篇使用说明，也不在页尾留 bot 备注。

收工顺序：写完 → 内容审 Pass → 再 bloom → 复审。

## 阶段

| 阶段 | 代码 | 输入 | 输出 | 写入 Notion |
| --- | --- | --- | --- | --- |
| ingest | `ingestDeck` / `ingest_deck` | pdf 或 pptx 路径 | 每页文字，以及 LibreOffice 渲出的整页截图。占位图不算 | 否 |
| skeleton | `draft_lecture` | 课件摘录 | 结构骨架和占位，不是成品讲解。正文由 Agent 填 | 否 |
| content gate | `reviewContent` | 草稿 | `pass` 或失败原因 | 否 |
| beautify | `audit_page` → `preview_page` → `apply_plan` | 已过关的页面 | 版式计划和快照 | 仅 `apply_plan` 且 `dryRun: false`，并且 `handoff_status` 已是 `content_pass` |
| publish | `run_lecture_pipeline` 收到 Agent 的 `draft` 之后 | 过关讲解，或明确要求待审的失败稿 | Notion 页面 | 是。没传 draft 不写入。失败稿不美化。截图只作配图 |

`refuseBeautify` 在内容审失败时直接拒绝进入 bloom。`review` 只放行待审写入，不放行美化。`handoff_status` 没有 `content_pass` 时，`apply_plan` 的真正写入同样拒绝。要排除的页面放进 `NOTION_BLOOM_DENY`，默认是空的。

## 不做什么

开源主路径不包含 `audit_figures` 和 `check_writeup`。配图是生成阶段的质量要求（截图或标【图缺】），不是单独的公开审计工具。手写作业的英文书写版不进入这个工具。也不提供「分配审稿人」「发通知」「退回给某人」。

## 美化链路

顺序固定，每一步都是一次独立调用：

1. `audit_page` 按主题打分，只读。
2. `preview_page` 出计划，并给一张前后对比图。不写回。
3. `apply_plan` 默认 `dryRun: true`。真正写入要求 `handoff_status` 已经是 `content_pass`（或本轮已经在 `beautifying`）。写入成功后状态变为 `beautifying`。
4. `rollback` 用返回的快照重建页面。块 id 会变。

主题仍然是三套，配色保持克制：`clean-docs`、`warm-notes`、`focus-brief`。颜色用来分类，不是用来装饰。改变块类型会删除重建，评论和 `#block` 链接会丢，可用 `allowRecreate: false` 关掉。

对比图是版式和配色的近似，不是像素级的 Notion 截图。

## 工具

| 工具 | 写入 | 作用 |
| --- | --- | --- |
| `ingest_deck` | 否 | 流水线第一步：读课件 |
| `draft_lecture` | 否 | 起草讲解并跑内容审。不过关就不美化、不写入 |
| `list_themes` | 否 | 主题、调色板、callout 语义 |
| `get_design_spec` | 否 | 排版规范全文 |
| `search_pages` | 否 | 按关键词找当前 integration 能看到的页面 |
| `audit_page` | 否 | 五维评分和可修复问题 |
| `preview_page` | 否 | 计划 + 前后对比图 |
| `preview_sample` | 否 | 内置样例的对比图，不需要 token |
| `render_page` | 否 | 只看当前页面的渲染 |
| `apply_plan` | 默认否 | 演练或写入。真正写入受审阅状态约束 |
| `rollback` | 是 | 按快照重建，必须 `confirm: true` |
| `audit_formulas` | 否 | 无效或破损公式及位置 |
| `audit_structure` | 否 | 中英标题、考点标记、跳步和缺推导 |
| `scan_layout_rules` | 否 | 站立式版式：表格、长说明框、层级、封面图标、留白 |
| `handoff_status` | 只写状态文件 | `content_pass` / `beautifying` / `rereview_pass` |
| `diff_after_beautify` | 否 | 对照快照，抓事实被改和公式被损坏 |

### `audit_formulas`

扫描三类位置：

- 公式块（equation）
- 段落等块里的行内公式
- 数据库公式属性。表达式从 data source 读；页面上的计算结果如果是 `unsupported`，记为损坏

展示公式用 KaTeX 解析。解析失败或表达式为空，算无效，并带上 KaTeX 的报错。数据库公式不是 KaTeX，只检查括号是否配对，再叠加接口给出的 `unsupported`。

返回每一处的 `locationId`、面包屑或属性名、表达式、原因。

### `audit_structure`

面向初学者，只报规则能确定的缺口，不评价证明漂不漂亮。

- 页面标题和各级标题要同时有中文和英文。缺一种就指出缺的是哪一种，并给出「中文 / English」这种补法。
- 「重点 / 考点 / key point」出现在普通段落里，且开头没有小图标，算没标出。修法是收成 🎯 或 📌 提示框。
- 编号步骤从 2 跳到 4 这种，指出缺的是哪一步，要求把那一步的操作或等式写出来。
- 「显然」「不难看出」「同理可得」「略」「trivial」这一类句子，要求补上从上一个式子到结论的中间行。

### `scan_layout_rules`

和美化计划分开的站立检查：

- 有表格就指出。版式以标题和列表为主；必须对齐数字的表可以留，而且宜少。
- 含「使用说明 / 写作要求」且很长的提示框直接判不合格。页面上不放写作说明书。
- 长页面没有标题，层级不成立。
- 没有图标、没有封面，或连续多段纯文字没有停顿。

### `handoff_status`

状态存在工作目录的 `.notion-bloom/handoff.json`（可用 `NOTION_BLOOM_STATE` 换路径）。不写进 Notion 正文，避免把审阅标记混进文档。

允许的转移：

- 未记录、或已经 `rereview_pass` → `content_pass`
- `content_pass` 或已经在 `beautifying` → `beautifying`
- `beautifying` → `rereview_pass`

其他转移拒绝，并且不改文件。`apply_plan` 在非演练时自己把成功的写入记成 `beautifying`。复审 Pass 只由调用方在看过 `diff_after_beautify` 之后写入。

### `diff_after_beautify`

输入是 `apply_plan` 的快照和页面现在的样子。

- 事实：美化前每一段读者能读到的文字，去掉空白后，必须仍出现在美化后的全文里。美化后新出现、又不是从原文里抄出来的短语，算插入。拆段、以及用原文里已有的词做标题，不算改事实。
- 公式：表达式少了、数据库公式表达式变了、或一份原来能解析的公式变成解析失败，算损坏。

`clean: false` 时不应把状态记成 `rereview_pass`。工具不代做这个判断的后续动作，只把 diff 交回去。

## 接到真实页面

`NOTION_TOKEN` 是 integration token。页面要分享给这个 integration。`search_pages` 只返回该 integration 看得到的页面。`audit_formulas`、`audit_structure`、`scan_layout_rules`、`diff_after_beautify` 都走同一条读取路径：页面块树，加上数据库公式属性（父级是 data source 或 database 时再读一次 schema）。读 schema 失败时，页面上的 `unsupported` 仍然会报。
