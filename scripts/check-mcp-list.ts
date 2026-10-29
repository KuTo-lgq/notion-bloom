import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const expected = [
  "apply_plan",
  "audit_formulas",
  "audit_page",
  "audit_structure",
  "diff_after_beautify",
  "draft_lecture",
  "get_design_spec",
  "handoff_status",
  "ingest_deck",
  "list_themes",
  "preview_page",
  "preview_sample",
  "render_page",
  "rollback",
  "run_lecture_pipeline",
  "scan_layout_rules",
  "search_pages",
];

async function main() {
  const dir = await mkdtemp(path.join(tmpdir(), "bloom-mcp-"));
  const state = path.join(dir, "handoff.json");
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["--no-install", "tsx", "src/mcp/stdio.ts"],
    cwd: new URL("..", import.meta.url).pathname,
    env: { ...process.env, NOTION_BLOOM_STATE: state },
  });
  const client = new Client({ name: "notion-bloom-check", version: "0.0.0" });
  await client.connect(transport);
  const names = (await client.listTools()).tools.map((tool) => tool.name).sort();
  const missing = expected.filter((name) => !names.includes(name));
  const extra = names.filter((name) => !expected.includes(name));
  console.log("tools", names.join(", "));
  if (missing.length > 0 || extra.length > 0) {
    console.log("missing", missing, "extra", extra);
    process.exit(1);
  }

  const spec = await client.callTool({ name: "get_design_spec", arguments: {} });
  const specText = Array.isArray(spec.content) ? spec.content.find((item) => item.type === "text") : undefined;
  if (!specText || specText.type !== "text" || !specText.text.includes("素雅文档")) {
    console.log("FAIL get_design_spec");
    process.exit(1);
  }
  console.log("PASS get_design_spec");

  const formulas = await client.callTool({ name: "audit_formulas", arguments: { pageId: "abc" } });
  if (!formulas.isError) {
    console.log("FAIL audit_formulas should refuse without a token");
    process.exit(1);
  }
  console.log("PASS audit_formulas refuses without a token");

  const set = await client.callTool({
    name: "handoff_status",
    arguments: { pageId: "11111111222233334444555566667777", action: "set", state: "beautifying" },
  });
  if (!set.isError) {
    console.log("FAIL handoff allowed beautifying with no prior review");
    process.exit(1);
  }
  const passed = await client.callTool({
    name: "handoff_status",
    arguments: { pageId: "11111111222233334444555566667777", action: "set", state: "content_pass" },
  });
  if (passed.isError) {
    console.log("FAIL content_pass", passed);
    process.exit(1);
  }
  console.log("PASS handoff_status gate over MCP");

  const prompts = (await client.listPrompts()).prompts.map((prompt) => prompt.name).sort();
  const wantedPrompts = ["bloom_page", "write_lecture"];
  const missingPrompts = wantedPrompts.filter((name) => !prompts.includes(name));
  if (missingPrompts.length > 0) {
    console.log("FAIL prompts", prompts, "missing", missingPrompts);
    process.exit(1);
  }
  const lecture = await client.getPrompt({ name: "write_lecture", arguments: { deckPath: "fixtures/lesson-step.pptx" } });
  const lectureText = lecture.messages.map((message) => (message.content.type === "text" ? message.content.text : "")).join("\n");
  if (!lectureText.includes("不调用") || !lectureText.includes("【公式缺】") || !lectureText.includes("fixtures/lesson-step.pptx") || !lectureText.includes("向用户要他自己的 Internal Integration Secret")) {
    console.log("FAIL write_lecture prompt");
    process.exit(1);
  }
  console.log("PASS prompts", prompts.join(", "));

  await rm(dir, { recursive: true, force: true });
  console.log("MCP smoke passed");
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
