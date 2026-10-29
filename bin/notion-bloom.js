#!/usr/bin/env node
/**
 * Local entry, same shape as `npx impeccable install`.
 * `install` writes the agent skill. With no subcommand, this speaks MCP on stdio.
 * It does not call a model and it does not publish the package.
 */

const { spawn } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const tsx = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
const command = process.argv[2];

function run(script, args) {
  const child = spawn(process.execPath, [tsx, script, ...args], {
    cwd: root,
    stdio: "inherit",
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
    ["notion-bloom install   write the agent skill and keep the MCP entry", "notion-bloom           start the MCP server on stdio", "No model API is used. This package stays private.", ""].join("\n"),
  );
} else {
  process.stderr.write(`Unknown command ${command}. Try: notion-bloom install\n`);
  process.exit(1);
}
