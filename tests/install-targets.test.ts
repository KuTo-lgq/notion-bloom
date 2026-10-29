import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { installInto, withNotionBloomCodex, withNotionBloomMcp } from "@/cli/install-targets";

test("mcp json keeps other servers and an existing token", () => {
  const next = withNotionBloomMcp(
    JSON.stringify({
      mcpServers: {
        other: { command: "echo" },
        "notion-bloom": { command: "old", env: { NOTION_TOKEN: "local-test-token" } },
      },
    }),
  );
  const parsed = JSON.parse(next) as {
    mcpServers: Record<string, { command: string; args?: string[]; env?: { NOTION_TOKEN?: string } }>;
  };
  assert.equal(parsed.mcpServers.other.command, "echo");
  assert.deepEqual(parsed.mcpServers["notion-bloom"].args, ["--no-install", "notion-bloom"]);
  assert.equal(parsed.mcpServers["notion-bloom"].env?.NOTION_TOKEN, "local-test-token");
});

test("codex toml gains one notion-bloom server", () => {
  const once = withNotionBloomCodex("model = \"gpt\"\n");
  const twice = withNotionBloomCodex(once);
  assert.equal(twice.match(/\[mcp_servers\.notion-bloom\]/g)?.length, 1);
  assert.match(twice, /command = "npx"/);
  assert.match(twice, /model = "gpt"/);
});

test("install writes Cursor, Claude Code, Codex, and DeepSeek Harness files", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "bloom-install-"));
  await installInto(root, "# skill\n");
  for (const file of [
    ".cursor/skills/notion-bloom/SKILL.md",
    ".cursor/mcp.json",
    ".claude/skills/notion-bloom/SKILL.md",
    ".mcp.json",
    ".agents/skills/notion-bloom/SKILL.md",
    ".codex/config.toml",
    ".dsh/skills/notion-bloom/SKILL.md",
    ".dsh/mcp.json",
    ".dsh/cordis.patch.yml",
  ]) {
    const text = await readFile(path.join(root, file), "utf8");
    assert.ok(text.length > 0, file);
  }
});
