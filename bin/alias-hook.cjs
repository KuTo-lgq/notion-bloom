/**
 * Map `@/` to this package's `src/` while the process is resolving modules.
 *
 * tsx skips tsconfig `paths` for files under `node_modules`. After `npm install`,
 * the published sources sit there, so the CLI registers this hook before tsx.
 */
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");

const srcRoot = path.resolve(__dirname, "..", "src");
const original = Module._resolveFilename;

function mappedFile(request) {
  if (typeof request !== "string" || !request.startsWith("@/")) return null;
  const base = path.join(srcRoot, request.slice(2));
  const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`, path.join(base, "index.ts"), path.join(base, "index.tsx"), path.join(base, "index.js")];
  return candidates.find((file) => fs.existsSync(file)) ?? null;
}

Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  const file = mappedFile(request);
  if (file) return original.call(this, file, parent, isMain, options);
  return original.call(this, request, parent, isMain, options);
};
