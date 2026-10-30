import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("notion-bloom install writes MCP and skill files for each agent", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "bloom-cli-"));
  const result = spawnSync(process.execPath, [path.join(root, "bin", "notion-bloom.js"), "install"], {
    cwd: dir,
    encoding: "utf8",
    timeout: 20_000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.signal, null);

  const cursorMcp = JSON.parse(await readFile(path.join(dir, ".cursor", "mcp.json"), "utf8")) as {
    mcpServers: Record<string, { command?: string; args?: string[] }>;
  };
  assert.equal(cursorMcp.mcpServers["notion-bloom"].command, "npx");
  assert.deepEqual(cursorMcp.mcpServers["notion-bloom"].args, ["--no-install", "notion-bloom"]);

  const claudeMcp = JSON.parse(await readFile(path.join(dir, ".mcp.json"), "utf8")) as {
    mcpServers: Record<string, { command?: string; args?: string[] }>;
  };
  assert.equal(claudeMcp.mcpServers["notion-bloom"].command, "npx");

  for (const skill of [
    ".cursor/skills/notion-bloom/SKILL.md",
    ".claude/skills/notion-bloom/SKILL.md",
    ".agents/skills/notion-bloom/SKILL.md",
    ".dsh/skills/notion-bloom/SKILL.md",
  ]) {
    const text = await readFile(path.join(dir, skill), "utf8");
    assert.match(text, /Notion Bloom/, skill);
  }

  const codex = await readFile(path.join(dir, ".codex", "config.toml"), "utf8");
  assert.match(codex, /\[mcp_servers\.notion-bloom\]/);
  assert.match(codex, /notion-bloom/);

  const dsh = JSON.parse(await readFile(path.join(dir, ".dsh", "mcp.json"), "utf8")) as {
    mcpServers: Record<string, { command?: string }>;
  };
  assert.equal(dsh.mcpServers["notion-bloom"].command, "npx");
  const patch = await readFile(path.join(dir, ".dsh", "cordis.patch.yml"), "utf8");
  assert.match(patch, /mcp-notion-bloom/);
});
