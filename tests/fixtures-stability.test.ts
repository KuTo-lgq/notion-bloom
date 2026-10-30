import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { draftFromIngest } from "@/pipeline/draft";
import { reviewContent } from "@/pipeline/gate";
import { ingestDeck } from "@/pipeline/ingest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const tsx = require.resolve("tsx/cli");
const checkDeck = path.join(root, "scripts", "check-deck.ts");

const decks: Array<[string, number]> = [
  ["examples/fixtures/short.pptx", 3],
  ["examples/fixtures/mini-deck.pptx", 8],
  ["fixtures/lesson-step.pptx", 1],
  ["examples/bayes-lecture.pptx", 1],
];

for (const [rel, minSlides] of decks) {
  test(`ingest and content gate stay up for ${rel}`, async () => {
    const ingest = await ingestDeck(path.join(root, rel));
    assert.ok(ingest.slides.length >= minSlides, `${rel} has ${ingest.slides.length} slides`);
    const gate = reviewContent(draftFromIngest(ingest));
    assert.equal(typeof gate.pass, "boolean");
    assert.ok(Array.isArray(gate.failures));
  });
}

function checkBad(file: string): { status: number | null; signal: NodeJS.Signals | null; stderr: string } {
  const result = spawnSync(process.execPath, [tsx, checkDeck, file], {
    cwd: root,
    encoding: "utf8",
    timeout: 15_000,
  });
  return { status: result.status, signal: result.signal, stderr: result.stderr };
}

test("an empty deck exits with a clear error", () => {
  const result = checkBad(path.join(root, "examples/fixtures/empty.pptx"));
  assert.equal(result.signal, null);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /课件是空文件/);
});

test("a file that is not a pptx exits with a clear error", () => {
  const result = checkBad(path.join(root, "examples/fixtures/not-a-deck.pptx"));
  assert.equal(result.signal, null);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /不是有效的 \.pptx/);
});

test("a non-deck extension exits with a clear error", () => {
  const result = checkBad(path.join(root, "examples/fixtures/not-a-deck.txt"));
  assert.equal(result.signal, null);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /课件需要是 \.pdf 或 \.pptx/);
});

test("a missing deck exits with a clear error", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "bloom-missing-"));
  const result = checkBad(path.join(dir, "missing.pptx"));
  assert.equal(result.signal, null);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /找不到课件/);
});
