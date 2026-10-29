import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createMcpServer, shutdownMcp } from "./server";

async function main() {
  const server = createMcpServer();
  const transport = new StdioServerTransport();

  const stop = () => {
    void shutdownMcp().finally(() => process.exit(0));
  };
  process.on("SIGINT", stop);
  process.stdin.on("end", stop);

  await server.connect(transport);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
