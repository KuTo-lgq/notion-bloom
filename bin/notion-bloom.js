#!/usr/bin/env node
/**
 * Entry for `npx notion-bloom`.
 * `install` writes the agent skill. With no subcommand, this speaks MCP on stdio.
 * It does not call a model.
 */

const { spawn } = require("node:child_process");
const { createRequire } = require("node:module");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
// `tsx/cli` is the exported entry. Resolving from this package finds tsx
// whether npm hoists it (npx) or nests it next to the bin.
const requireFromPackage = createRequire(path.join(root, "package.json"));
const tsx = requireFromPackage.resolve("tsx/cli");
const command = process.argv[2];

function run(script, args) {
  const hook = path.join(root, "bin", "alias-hook.cjs");
  // tsx re-execs Node and drops extra -r flags. NODE_OPTIONS survives that re-exec.
  // The hook maps `@/` once the published sources sit inside node_modules, where
  // tsx ignores tsconfig paths. TSX_TSCONFIG_PATH covers a checkout run from another cwd.
  const existing = process.env.NODE_OPTIONS ?? "";
  const env = {
    ...process.env,
    NODE_OPTIONS: [existing, `--require ${JSON.stringify(hook)}`].filter((part) => part.length > 0).join(" "),
    TSX_TSCONFIG_PATH: path.join(root, "tsconfig.json"),
  };
  // Keep the caller's cwd. `install` and the handoff file write into that project.
  const child = spawn(process.execPath, [tsx, script, ...args], {
    stdio: "inherit",
    env,
  });
  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 1);
  });
}

if (command === "install") {
  run(path.join(root, "src", "cli", "install.ts"), process.argv.slice(3));
} else if (command === undefined || command === "mcp" || command === "serve") {
  run(path.join(root, "src", "mcp", "stdio.ts"), process.argv.slice(command ? 3 : 2));
} else if (command === "help" || command === "--help" || command === "-h") {
  process.stdout.write(
    ["notion-bloom install   write the agent skill and keep the MCP entry", "notion-bloom           start the MCP server on stdio", "No model API is used.", ""].join("\n"),
  );
} else {
  process.stderr.write(`Unknown command ${command}. Try: notion-bloom install\n`);
  process.exit(1);
}
