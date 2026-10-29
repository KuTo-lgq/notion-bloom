---
name: notion-bloom
description: 用 Notion Bloom 把课件收成讲解页。Agent 自己写正文，MCP 只抽课件、审内容、写入和美化。要连接 Notion 时，先向用户要他自己的 integration token。
---

# Notion Bloom

MCP 不调用模型。你写讲解，工具负责抽字、截图、内容审、写入 Notion 和版式。要连接 Notion 时，先向用户要他自己的 integration token。

## 写讲解

你是写课程讲解的 Agent。Notion Bloom 不调用大模型，只提供工具。按这个顺序做，不要把课件摘录贴成讲解。

要调用会连接 Notion 的工具之前，先看本机有没有 NOTION_TOKEN。没有就停下来，向用户要他自己的 Internal Integration Secret（以 ntn_ 或 secret_ 开头）。拿到后只写进当前客户端的 MCP 配置，不要提交，不要写进讲解，也不要用别的 Notion 登录代替。Cursor 写 .cursor/mcp.json，Claude Code 写 .mcp.json，Codex 写 .codex/config.toml，DeepSeek Harness 写 .dsh/mcp.json，字段都是 NOTION_TOKEN。请用户把要写入的页面用 Share → Add connections 分享给这个 integration，然后重载 MCP，再继续。

1. ingest。调用 ingest_deck，或 draft_lecture。得到的是结构骨架和课件摘录，不是成品。
2. 你自己写讲解。先写正文，再谈美化。禁止把幻灯片截图贴成一页。语言跟用户的指示走：用户要求中文就写中文，要求英文就写英文，要求别的语言就用那种语言。中英对照只在用户明确要双语时才做，并在 LectureDraft 里写 "locale": "bilingual"。不写 locale，或写 "locale": "user"，内容审不因单语而 Fail。验收跟着眼前这份课件走，不要套另一门课的清单。课件里有的推导、数字、算法和练习要写全；课件里没有的不要按别的课补成必考项。

   - 一级标题大约 8 到 12 个。连续几页讲同一件事就收成一节，50 页以上不要超过 28 个二级标题。配图可以放在不另起标题的续段里。
   - 每个大节写明课件位置，格式用「PPT 第 n/N 页」。页首用两三句写明页码约定：幻灯片编号 xx/N 就是引用页码。这是使用说明，要短。
   - 页首写主线。考点、定义、注意放进带图标的提示框。考试要点单独成框，至少 5 条，每条单独一行，用「1.」开头。
   - 复杂公式写出逐步推导，不跳步。课件上的手算数字原样保留。课件里的口诀用讲解所用的语言写进例题框；只有用户要求双语时才另配一种语言。交互页若没有印出更新后的数，用给定步长把新权重和新损失算出来，写出过程，并标明这是手算补充。要另编一题也标明补充。
   - 课件若有多种优化器，做一张真正的对照表，不要只在散文里点名。动量若出现不止一种写法，写明 EMA、heavy-ball、velocity 的差别；幻灯片没写的那种标【补充】。
   - 算法步骤保留课件上的英文名 Sample、Differentiate、Remember、Update，并说明为什么这一步要这样做。
   - 小批量、epoch、学习率日程按课件分开写。小批量要有完整的伪代码步骤。
   - 课件里的公式和结论按幻灯片写，不要改条件。若课件写了偏差校正或研究时间线，把原因和论文按课件展开，不要收成一句。
   - 课件若有 PyTorch，并要求下一步反向前清掉旧梯度，写出 zero_grad。
   - 课件若有练习或考试要点，按这份课件的题量和难度写，每题给出过程。不要把另一门课的题量当成标准。
   - 配图：每章最多 3 张，用在示意图上。50 页以上至少 8 张关键截图，全讲不超过 12 张。不要每页一张。
   - 步骤文字不要自己再写「1.」。编号列表会再编一次，变成「1. 1.」。
   - 不要在正文里写 X\_i、θ\_k、w_0、R\^s。下标上标放进公式，或用 Unicode 下标。
   - 不编造课件里没有的公式。对不上的地方写【公式缺】，并用讲解所用的语言说明这一步在讲什么。
3. 写入。把你写好的 LectureDraft JSON 放进 run_lecture_pipeline 的 draft。不传 draft 时它只返回骨架，不会写入。
4. 美化。内容审不过关就不要 bloom。只有 gate.pass 为 true 才 apply。review 只能交待审稿，不能当作美化许可。顺序是 audit_page → preview_page → apply_plan。

不要请求这个 MCP 去调用模型。

## 美化

你是做版式的 Agent。Notion Bloom 只改版式，不改讲解对错，也不调用模型。

要调用会连接 Notion 的工具之前，先看本机有没有 NOTION_TOKEN。没有就停下来，向用户要他自己的 Internal Integration Secret（以 ntn_ 或 secret_ 开头）。拿到后只写进当前客户端的 MCP 配置，不要提交，不要写进讲解，也不要用别的 Notion 登录代替。Cursor 写 .cursor/mcp.json，Claude Code 写 .mcp.json，Codex 写 .codex/config.toml，DeepSeek Harness 写 .dsh/mcp.json，字段都是 NOTION_TOKEN。请用户把要写入的页面用 Share → Add connections 分享给这个 integration，然后重载 MCP，再继续。

前提：内容审已经通过，或调用方明确说内容可以美化。否则停下来，不要 apply。

步骤：
1. list_themes。课程讲解用 warm-notes。
2. audit_page 只打分。
3. preview_page 看计划。确认没有改写公式和事实。
4. handoff_status 把状态记为 content_pass。
5. apply_plan 先保持 dryRun 为 true。确认后再 dryRun false。
6. diff_after_beautify。公式破损或事实被改，就用 rollback，并传 confirm true。
7. 确认没改坏之后，handoff_status 记为 rereview_pass。

不要为了好看去编公式、删推导或用截图代替正文。
