/**
 * MCP server.
 *
 * The tools are deliberately split the way an agent actually works: look, then
 * decide, then write. `preview_page` returns a picture, because a layout
 * judgement made without one is a guess. Nothing in here calls a model.
 */

import { extractPageId } from "@notionhq/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { formatAuditSummary } from "@/core/audit";
import { diffAfterBeautify } from "@/core/content-diff";
import { opTargets } from "@/core/diff";
import { auditFormulas } from "@/core/formulas";
import { beautifyAllowed, getHandoff, HANDOFF_STATES, setHandoff } from "@/core/handoff";
import { scanLayout } from "@/core/layout-scan";
import { applyOpsToPage, pageFromSnapshot, projectPlan, proposePlan } from "@/core/planner";
import { SAMPLE_META, getSample } from "@/core/samples";
import { designSpec } from "@/core/spec";
import { auditStructure } from "@/core/structure-audit";
import { THEMES } from "@/core/themes";
import type { Op } from "@/core/ops";
import type { Snapshot } from "@/core/planner";
import { applyToNotion, restoreSnapshot } from "@/notion/apply";
import { draftFromIngest } from "@/pipeline/draft";
import { refuseBeautify } from "@/pipeline/gate";
import { ingestDeck } from "@/pipeline/ingest";
import { runLecturePipeline, skeletonGate } from "@/pipeline/run";
import { notionClientFromEnv, notionWriter } from "@/pipeline/publish";
import { PPT_AGENT_NOTE } from "@/ppt/place";
import { createNotionClient, readPage, searchPages } from "@/notion/read";
import { closeBrowser, screenshotComparison, screenshotPage } from "@/renderer/screenshot";
import { ASK_FOR_NOTION_TOKEN, BLOOM_PROMPT, writeLecturePrompt } from "@/mcp/prompts";

function token(): string | undefined {
  return process.env.NOTION_TOKEN || process.env.NOTION_API_KEY || undefined;
}

function normalizePageId(input: string): string | null {
  return extractPageId(input);
}

function clientOrError(): { client: ReturnType<typeof createNotionClient> } | { error: string } {
  const auth = token();
  if (!auth) {
    return {
      error:
        `没有 Notion integration token。停下来，向用户要他自己的 Internal Integration Secret，不要继续调用。${ASK_FOR_NOTION_TOKEN}`,
    };
  }
  return { client: createNotionClient(auth) };
}

const themeId = z
  .string()
  .optional()
  .describe("主题 id：clean-docs、warm-notes、focus-brief。缺省用 clean-docs");

function text(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}

function failure(message: string) {
  return { isError: true as const, content: [{ type: "text" as const, text: message }] };
}

function registerAgentPrompts(server: McpServer): void {
  server.registerPrompt(
    "write_lecture",
    {
      title: "写课程讲解",
      description: "提示调用方 Agent 自己写讲解。服务器不调用模型。",
      argsSchema: { deckPath: z.string().optional().describe("可选，课件的本机路径") },
    },
    async ({ deckPath }) => ({
      messages: [{ role: "user", content: { type: "text", text: writeLecturePrompt(deckPath) } }],
    }),
  );
  server.registerPrompt(
    "bloom_page",
    {
      title: "美化已过关的讲解",
      description: "提示调用方 Agent 按审核、预览、写入、复核的顺序美化。服务器不调用模型。",
    },
    async () => ({
      messages: [{ role: "user", content: { type: "text", text: BLOOM_PROMPT } }],
    }),
  );
}

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "notion-bloom",
    title: "Notion Bloom",
    version: "0.3.0",
  });
  registerAgentPrompts(server);

  server.registerTool(
    "ingest_deck",
    {
      title: "读取课件",
      description: "流水线第一步。读取 pdf 或 pptx，返回每一页的标题、正文和有没有图。不写讲解，也不写 Notion。",
      inputSchema: { deckPath: z.string().describe("本机上的 .pdf 或 .pptx 路径") },
    },
    async ({ deckPath }) => {
      try {
        return text(await ingestDeck(String(deckPath)));
      } catch (error) {
        return failure(error instanceof Error ? error.message : "打不开课件");
      }
    },
  );

  server.registerTool(
    "draft_lecture",
    {
      title: "从课件起草讲解并做内容审",
      description: `只返回结构骨架和课件摘录，供 Agent 自己写讲解。这不是成品，不会调用模型，也不写入 Notion。Agent 写好 draft 后交给 run_lecture_pipeline。${PPT_AGENT_NOTE}`,
      inputSchema: { deckPath: z.string().describe("本机上的 .pdf 或 .pptx 路径") },
    },
    async ({ deckPath }) => {
      try {
        const ingest = await ingestDeck(String(deckPath));
        const skeleton = draftFromIngest(ingest);
        const gate = skeletonGate(skeleton);
        return text({
          role: "skeleton",
          note: "这不是成品讲解。正文由 Agent 撰写，再把 draft 交给 run_lecture_pipeline。本工具不调用模型。",
          ingest: { sourcePath: ingest.sourcePath, slides: ingest.slides.length },
          skeleton,
          gate,
          beautify: refuseBeautify(gate),
        });
      } catch (error) {
        return failure(error instanceof Error ? error.message : "起草失败");
      }
    },
  );

  server.registerTool(
    "run_lecture_pipeline",
    {
      title: "从课件生成讲解并按门禁写入",
      description:
        "读课件并给出结构骨架。讲解正文由 Agent 通过 draft（JSON 字符串）提供；不传 draft 则只返回骨架，不写入。传入 draft 后跑内容审。不过关默认不写入、不美化。review 为 true 时把待审稿写入 parentPageId，仍然不美化。apply 为 true 时只在内容审通过之后美化，公式被改坏会回滚。本工具不调用模型。",
      inputSchema: {
        deckPath: z.string().describe("本机上的 .pdf 或 .pptx 路径"),
        draft: z.string().optional().describe("Agent 写好的讲解 JSON（LectureDraft）。不传则只返回骨架"),
        parentPageId: z.string().optional().describe("新页面的父页面 id。不传则只返回审稿结果，不写入"),
        review: z.boolean().optional().describe("内容审失败时仍写入待审页。不因此放行美化"),
        apply: z.boolean().optional().describe("内容审通过后套用 warm-notes。失败的稿不会美化"),
        title: z.string().optional().describe("页面标题。不传则用课件标题"),
        themeId,
      },
    },
    async ({ deckPath, draft, parentPageId, review, apply, title, themeId: theme }) => {
      try {
        const client = notionClientFromEnv();
        const parent = parentPageId?.trim() ?? "";
        const parsed = draft ? (JSON.parse(draft) as unknown) : undefined;
        const result = await runLecturePipeline({
          deckPath: String(deckPath),
          draft: parsed,
          parentPageId: parent || undefined,
          review,
          apply,
          title,
          themeId: theme,
          client,
          writer: client && parent ? notionWriter(client) : undefined,
        });
        return text(result);
      } catch (error) {
        return failure(error instanceof Error ? error.message : "流水线失败");
      }
    },
  );

  server.registerTool(
    "list_themes",
    {
      title: "列出排版主题",
      description:
        "列出可用的排版主题、各自适合的内容类型、调色板和 callout 语义。改页面前先看这个，选一个主题再审计。",
    },
    async () =>
      text(
        THEMES.map((theme) => ({
          id: theme.id,
          name: theme.name,
          nameEn: theme.nameEn,
          description: theme.description,
          bestFor: theme.bestFor,
          palette: theme.palette,
          callouts: theme.callouts,
          principles: theme.principles,
        })),
      ),
  );

  server.registerTool(
    "get_design_spec",
    {
      title: "读取排版规范",
      description:
        "返回完整的排版规范：哪些改动值得做、哪些 API 做不到、每条规则为什么存在。在没有接上 Notion 时也可以单独遵守这份规范。",
    },
    async () => ({ content: [{ type: "text" as const, text: designSpec() }] }),
  );

  server.registerTool(
    "search_pages",
    {
      title: "搜索 Notion 页面",
      description: "按标题关键词搜索当前 integration 能访问的页面，返回 page id 和链接。",
      inputSchema: { query: z.string().describe("标题或正文关键词") },
    },
    async ({ query }) => {
      const ready = clientOrError();
      if ("error" in ready) return failure(ready.error);
      const pages = await searchPages(ready.client, query);
      return text(pages);
    },
  );

  server.registerTool(
    "audit_page",
    {
      title: "审计一个页面",
      description: `读取页面并按主题打分。返回五个维度的分数、问题清单，以及每条问题对应的修复建议。只读，不修改页面。${PPT_AGENT_NOTE}`,
      inputSchema: {
        pageId: z.string().describe("页面 id 或页面 URL"),
        themeId,
      },
    },
    async ({ pageId, themeId: theme }) => {
      const ready = clientOrError();
      if ("error" in ready) return failure(ready.error);
      const { page, limits } = await readPage(ready.client, pageId);
      const plan = proposePlan(page, { themeId: theme });
      return text({
        page: { id: page.id, title: page.title, url: page.url },
        limits,
        score: plan.audit.overall,
        grade: plan.audit.grade,
        summary: formatAuditSummary(plan.audit),
        dimensions: plan.audit.dimensions,
        findings: plan.audit.findings.map(presentFinding),
      });
    },
  );

  server.registerTool(
    "preview_page",
    {
      title: "预览美化方案",
      description: `生成美化计划，返回执行前后的对比图和预计分数变化。不写回 Notion。看图之后再决定要不要 apply。对比图是版式和配色的近似渲染，不是像素级的 Notion 截图。${PPT_AGENT_NOTE}`,
      inputSchema: {
        pageId: z.string().describe("页面 id 或页面 URL"),
        themeId,
        includeDestructive: z
          .boolean()
          .optional()
          .describe("是否把会改写或删除原文的操作纳入计划，默认 false"),
        allowRecreate: z
          .boolean()
          .optional()
          .describe("是否允许删除重建块以改变块类型。会更换块 id 并丢失该块上的评论，默认 true"),
      },
    },
    async ({ pageId, themeId: theme, includeDestructive, allowRecreate }) => {
      const ready = clientOrError();
      if ("error" in ready) return failure(ready.error);
      const { page, limits } = await readPage(ready.client, pageId);
      const built = buildPreview(page, { themeId: theme, includeDestructive, allowRecreate });
      const png = await screenshotComparison(page, built.after, {
        beforeLabel: `BEFORE  ·  ${built.projection.before.overall}/100`,
        afterLabel: `AFTER  ·  ${built.projection.after.overall}/100  (${signed(built.projection.delta)})`,
        changedIds: built.targets.changedIds,
        addedIds: built.targets.addedIds,
        removedIds: built.targets.removedIds,
        maxHeight: 2200,
      });
      return {
        content: [
          { type: "text" as const, text: JSON.stringify({ ...built.report, limits }, null, 2) },
          { type: "image" as const, data: png.toString("base64"), mimeType: "image/png" },
        ],
      };
    },
  );

  server.registerTool(
    "preview_sample",
    {
      title: "预览内置样例",
      description:
        "对内置的样例页面出计划和对比图，不需要 Notion token。sampleId 取 payment-spec、reading-notes、weekly-report 三者之一，不传则返回样例清单。",
      inputSchema: {
        sampleId: z.string().optional().describe("sample-payment-spec、sample-reading-notes 或 sample-weekly-report"),
        themeId,
      },
    },
    async ({ sampleId, themeId: theme }) => {
      if (!sampleId) return text(SAMPLE_META);
      const page = getSample(sampleId);
      if (!page) return failure(`没有这个样例。可选：${SAMPLE_META.map((m) => m.id).join("、")}`);
      const built = buildPreview(page, { themeId: theme ?? suggestedTheme(sampleId) });
      const png = await screenshotComparison(page, built.after, {
        beforeLabel: `BEFORE  ·  ${built.projection.before.overall}/100`,
        afterLabel: `AFTER  ·  ${built.projection.after.overall}/100  (${signed(built.projection.delta)})`,
        ...built.targets,
        maxHeight: 2200,
      });
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(built.report, null, 2) },
          { type: "image" as const, data: png.toString("base64"), mimeType: "image/png" },
        ],
      };
    },
  );

  server.registerTool(
    "apply_plan",
    {
      title: "把计划写回 Notion",
      description: `重新读取页面、生成计划并执行。默认 dryRun 为 true，只会报告将要做什么。真正写入前必须已有 handoff_status 的 content_pass（或正在 beautifying）。写入成功后状态变为 beautifying。返回快照，供 rollback 和 diff_after_beautify 使用。${PPT_AGENT_NOTE}`,
      inputSchema: {
        pageId: z.string(),
        themeId,
        dryRun: z.boolean().optional().describe("默认 true"),
        includeDestructive: z.boolean().optional(),
        allowRecreate: z.boolean().optional(),
        opIds: z.array(z.string()).optional().describe("只执行这些操作 id；不传则执行计划中的全部安全操作"),
      },
    },
    async ({ pageId, themeId: theme, dryRun, includeDestructive, allowRecreate, opIds }) => {
      const ready = clientOrError();
      if ("error" in ready) return failure(ready.error);
      const id = normalizePageId(pageId);
      if (!id) return failure("这个链接里没有页面 id。");
      const dry = dryRun ?? true;
      const record = await getHandoff(id);
      const gate = beautifyAllowed(record?.state ?? null);
      if (!dry && !gate.allowed) return failure(gate.reason);
      const { page, limits } = await readPage(ready.client, id);
      const plan = proposePlan(page, { themeId: theme, includeDestructive, allowRecreate });
      const chosen = opIds?.length ? plan.ops.filter((op) => opIds.includes(op.id)) : plan.ops;
      const report = await applyToNotion({
        client: ready.client,
        page,
        ops: chosen,
        dryRun: dry,
      });
      if (!dry && report.failed === 0 && report.applied > 0) {
        await setHandoff(id, "beautifying");
      }
      return text({
        title: page.title,
        url: page.url,
        limits,
        reviewGate: gate,
        warnings: plan.warnings,
        dryRun: report.dryRun,
        applied: report.applied,
        skipped: report.skipped,
        failed: report.failed,
        results: report.results,
        snapshot: report.snapshot,
      });
    },
  );

  server.registerTool(
    "audit_formulas",
    {
      title: "扫描无效公式",
      description:
        "读取页面，检查行内公式、公式块和数据库公式属性。列出每一处无效或破损公式的位置和原因。只读。KaTeX 负责展示公式，数据库公式只做括号配对，并把接口返回的 unsupported 当作损坏。",
      inputSchema: { pageId: z.string().describe("页面 id 或页面 URL") },
    },
    async ({ pageId }) => {
      const ready = clientOrError();
      if ("error" in ready) return failure(ready.error);
      const id = normalizePageId(pageId);
      if (!id) return failure("这个链接里没有页面 id。");
      const { page, limits } = await readPage(ready.client, id);
      return text({ title: page.title, url: page.url, limits, ...auditFormulas(page) });
    },
  );

  server.registerTool(
    "audit_structure",
    {
      title: "检查初学者能不能跟着读",
      description:
        "规则检查：重点和考点有没有用小图标或提示框标出、步骤编号有没有跳步、有没有用「显然 / 略」跳过推导。不强制双语。只报告，不改页面。不判断内容对错。",
      inputSchema: { pageId: z.string().describe("页面 id 或页面 URL") },
    },
    async ({ pageId }) => {
      const ready = clientOrError();
      if ("error" in ready) return failure(ready.error);
      const id = normalizePageId(pageId);
      if (!id) return failure("这个链接里没有页面 id。");
      const { page, limits } = await readPage(ready.client, id);
      return text({ title: page.title, url: page.url, limits, ...auditStructure(page) });
    },
  );

  server.registerTool(
    "scan_layout_rules",
    {
      title: "站立式版式检查",
      description:
        "只读检查版式是否站得住：少用表格、禁止长篇「使用说明 / 写作要求」提示框、文档要有标题层级、要有封面和图标、正文不要挤成一整块。不改页面。",
      inputSchema: { pageId: z.string().describe("页面 id 或页面 URL") },
    },
    async ({ pageId }) => {
      const ready = clientOrError();
      if ("error" in ready) return failure(ready.error);
      const id = normalizePageId(pageId);
      if (!id) return failure("这个链接里没有页面 id。");
      const { page, limits } = await readPage(ready.client, id);
      return text({ title: page.title, url: page.url, limits, ...scanLayout(page) });
    },
  );

  server.registerTool(
    "handoff_status",
    {
      title: "记录审阅状态",
      description:
        "记录 content_pass（内容审通过）、beautifying（美化中）、rereview_pass（复审通过）。只存状态，不指派作者，也不通知任何人。没有 content_pass 时，apply_plan 的真正写入会被拒绝。action=get 只查询。",
      inputSchema: {
        pageId: z.string(),
        action: z.enum(["get", "set"]).describe("get 查询，set 记录"),
        state: z.enum(HANDOFF_STATES).optional().describe("set 时必填"),
        note: z.string().optional().describe("一句备注，可选"),
      },
    },
    async ({ pageId, action, state, note }) => {
      const id = normalizePageId(pageId);
      if (!id) return failure("这个链接里没有页面 id。");
      if (action === "get") {
        const record = await getHandoff(id);
        return text({ record, reviewGate: beautifyAllowed(record?.state ?? null) });
      }
      if (!state) return failure("set 时要给出 state：content_pass、beautifying 或 rereview_pass。");
      try {
        const record = await setHandoff(id, state, note);
        return text({ record, reviewGate: beautifyAllowed(record.state) });
      } catch (error) {
        return failure(error instanceof Error ? error.message : "状态没有写入");
      }
    },
  );

  server.registerTool(
    "diff_after_beautify",
    {
      title: "美化后对照",
      description:
        "把 apply_plan 返回的快照和页面现在的内容对照。抓两类问题：读者能读到的事实被改写或删掉，以及公式丢失、改坏或新变成无法解析。拆段、重复已有词语的新标题不算事实改动。只读。",
      inputSchema: {
        pageId: z.string(),
        snapshot: z.record(z.string(), z.unknown()).describe("apply_plan 返回的 snapshot"),
      },
    },
    async ({ pageId, snapshot }) => {
      const ready = clientOrError();
      if ("error" in ready) return failure(ready.error);
      const parsed = snapshot as unknown as Snapshot;
      if (parsed?.version !== 1 || !Array.isArray(parsed.blocks)) return failure("snapshot 不是本工具生成的快照。");
      const id = normalizePageId(pageId);
      if (!id) return failure("这个链接里没有页面 id。");
      const { page } = await readPage(ready.client, id);
      const diff = diffAfterBeautify(pageFromSnapshot(parsed), page);
      return text({ title: page.title, url: page.url, ...diff });
    },
  );

  server.registerTool(
    "rollback",
    {
      title: "按快照回滚页面",
      description:
        "用 apply_plan 返回的快照重建页面。这会删除页面当前的顶层块再按快照写回，块 id 全部改变，评论不会回来。必须传 confirm: true。",
      inputSchema: {
        snapshot: z.record(z.string(), z.unknown()).describe("apply_plan 返回的 snapshot 对象"),
        confirm: z.boolean().describe("确认执行回滚"),
      },
    },
    async ({ snapshot, confirm }) => {
      const ready = clientOrError();
      if ("error" in ready) return failure(ready.error);
      const parsed = snapshot as unknown as Snapshot;
      if (parsed?.version !== 1 || typeof parsed.pageId !== "string" || !Array.isArray(parsed.blocks)) {
        return failure("snapshot 不是本工具生成的快照。");
      }
      const result = await restoreSnapshot(ready.client, parsed, confirm);
      return text(result);
    },
  );

  server.registerTool(
    "render_page",
    {
      title: "把页面渲染成图片",
      description: "读取页面并返回当前样子的渲染图，不做任何修改。用来在修改后复查，或者在审计前先看一眼。",
      inputSchema: { pageId: z.string() },
    },
    async ({ pageId }) => {
      const ready = clientOrError();
      if ("error" in ready) return failure(ready.error);
      const { page } = await readPage(ready.client, pageId);
      const png = await screenshotPage(page, { label: page.title, maxHeight: 2200 });
      return {
        content: [
          { type: "text" as const, text: `${page.title}\n${page.url ?? ""}` },
          { type: "image" as const, data: png.toString("base64"), mimeType: "image/png" },
        ],
      };
    },
  );

  return server;
}

function suggestedTheme(sampleId: string): string | undefined {
  return SAMPLE_META.find((item) => item.id === sampleId)?.suggestedTheme;
}

function signed(delta: number): string {
  return `${delta >= 0 ? "+" : ""}${delta}`;
}

function presentFinding(finding: {
  ruleId: string;
  title: string;
  dimension: string;
  severity: string;
  message: string;
  suggestion: string;
  blockId?: string;
  excerpt?: string;
  ops: Op[];
  candidates?: unknown[];
}) {
  return {
    ruleId: finding.ruleId,
    title: finding.title,
    dimension: finding.dimension,
    severity: finding.severity,
    message: finding.message,
    suggestion: finding.suggestion,
    blockId: finding.blockId,
    excerpt: finding.excerpt,
    autoFix: finding.ops.some((op) => !op.destructive),
    candidateCount: finding.candidates?.length ?? 0,
  };
}

function buildPreview(
  page: Parameters<typeof proposePlan>[0],
  options: Parameters<typeof proposePlan>[1],
) {
  const plan = proposePlan(page, options);
  const projection = projectPlan(page, plan.ops, plan.themeId);
  const after = applyOpsToPage(page, plan.ops);
  const targets = opTargets(plan.ops);
  return {
    after,
    projection,
    targets,
    report: {
      title: page.title,
      themeId: plan.themeId,
      rounds: plan.rounds,
      score: { before: projection.before.overall, after: projection.after.overall, delta: projection.delta },
      summary: formatAuditSummary(projection.before),
      resolved: projection.resolvedRuleIds,
      remaining: projection.remainingRuleIds,
      warnings: plan.warnings,
      diff: plan.diff,
      ops: plan.ops.map((op) => ({ id: op.id, kind: op.kind, reason: op.reason, recreates: op.recreates ?? false })),
      withheld: plan.withheld.map((op) => ({ id: op.id, kind: op.kind, reason: op.reason })),
      candidates: plan.candidates.map((candidate) => ({
        id: candidate.id,
        blockId: candidate.blockId,
        excerpt: candidate.excerpt,
        question: candidate.question,
        variants: candidate.variants.map((variant) => ({
          label: variant.label,
          rationale: variant.rationale,
          op: variant.op,
        })),
      })),
    },
  };
}

export async function shutdownMcp(): Promise<void> {
  await closeBrowser();
}
