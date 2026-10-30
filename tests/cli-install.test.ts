import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("notion-bloom install writes into the caller directory", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "bloom-cli-"));
  const result = spawnSync(process.execPath, [path.join(root, "bin", "notion-bloom.js"), "install"], {
    cwd: dir,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const skill = await readFile(path.join(dir, ".cursor", "skills", "notion-bloom", "SKILL.md"), "utf8");
  assert.match(skill, /Notion Bloom/);
  const mcp = await readFile(path.join(dir, ".cursor", "mcp.json"), "utf8");
  assert.match(mcp, /notion-bloom/);
});
