import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function main() {
const transport = new StdioClientTransport({
  command: "npx",
  args: ["--no-install", "tsx", "src/mcp/stdio.ts"],
  cwd: new URL("..", import.meta.url).pathname,
});

const client = new Client({ name: "notion-bloom-check", version: "0.0.0" });
await client.connect(transport);
const listed = await client.listTools();
const names = listed.tools.map((tool) => tool.name).sort();
const spec = await client.callTool({ name: "get_design_spec", arguments: {} });
const sample = await client.callTool({
  name: "preview_sample",
  arguments: { sampleId: "sample-weekly-report" },
});
const content = Array.isArray(sample.content) ? sample.content : [];
console.log(names.join(", "));
console.log("spec", Array.isArray(spec.content) && spec.content[0]?.type === "text" ? "ok" : "missing");
console.log(
  "preview",
  content.map((item) => item.type).join("+"),
);
await client.close();
process.exit(0);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
