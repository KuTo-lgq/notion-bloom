/**
 * Project files each coding agent reads.
 * Cursor, Claude Code, Codex, and DeepSeek Harness do not share one config path.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const MCP_COMMAND = "npx";
export const MCP_ARGS = ["--no-install", "notion-bloom"] as const;

const CODEX_BLOCK = `[mcp_servers.notion-bloom]
command = "npx"
args = ["--no-install", "notion-bloom"]
`;

export type InstallTarget = {
  id: "cursor" | "claude-code" | "codex" | "deepseek-harness";
  skill: string;
  config: string;
  kind: "mcp-json" | "codex-toml";
};

const DSH_PATCH = `- insert:
    - id: mcp-notion-bloom
      name: "@deepseek-ai/dsh-mcp-client"
      config:
        serverName: notion-bloom
        transport: stdio
        command: npx
        args: ["--no-install", "notion-bloom"]
`;

export const INSTALL_TARGETS: InstallTarget[] = [
  { id: "cursor", skill: ".cursor/skills/notion-bloom/SKILL.md", config: ".cursor/mcp.json", kind: "mcp-json" },
  { id: "claude-code", skill: ".claude/skills/notion-bloom/SKILL.md", config: ".mcp.json", kind: "mcp-json" },
  { id: "codex", skill: ".agents/skills/notion-bloom/SKILL.md", config: ".codex/config.toml", kind: "codex-toml" },
  { id: "deepseek-harness", skill: ".dsh/skills/notion-bloom/SKILL.md", config: ".dsh/mcp.json", kind: "mcp-json" },
];

type McpFile = {
  mcpServers?: Record<string, { command?: string; args?: string[]; env?: Record<string, string> }>;
};

/** Keep other servers and an existing token. Only the launch command is set. */
export function withNotionBloomMcp(raw: string | null): string {
  let parsed: McpFile = {};
  if (raw?.trim()) {
    const value = JSON.parse(raw) as McpFile;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("MCP config must be a JSON object.");
    }
    parsed = value;
  }
  const servers = parsed.mcpServers ?? {};
  const current = servers["notion-bloom"] ?? {};
  servers["notion-bloom"] = {
    ...current,
    command: MCP_COMMAND,
    args: [...MCP_ARGS],
  };
  parsed.mcpServers = servers;
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

/** Codex reads project MCP servers from `.codex/config.toml` after the project is trusted. */
export function withNotionBloomCodex(raw: string | null): string {
  const block = CODEX_BLOCK.trimEnd();
  if (!raw?.trim()) return `${block}\n`;
  const section = /\[mcp_servers\.notion-bloom\][\s\S]*?(?=\n\[|$)/;
  if (section.test(raw)) return raw.replace(section, block).replace(/\s*$/, "\n");
  return `${raw.replace(/\s*$/, "\n\n")}${block}\n`;
}

async function readOptional(file: string): Promise<string | null> {
  try {
    return await readFile(file, "utf8");
  } catch {
    return null;
  }
}

export async function installInto(root: string, skill: string): Promise<string[]> {
  const written: string[] = [];
  for (const target of INSTALL_TARGETS) {
    const skillPath = path.join(root, target.skill);
    const configPath = path.join(root, target.config);
    await mkdir(path.dirname(skillPath), { recursive: true });
    await writeFile(skillPath, skill);
    written.push(skillPath);
    const current = await readOptional(configPath);
    const next = target.kind === "mcp-json" ? withNotionBloomMcp(current) : withNotionBloomCodex(current);
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, next);
    written.push(configPath);
  }
  const patchPath = path.join(root, ".dsh", "cordis.patch.yml");
  const patch = await readOptional(patchPath);
  if (!patch?.includes("mcp-notion-bloom")) {
    const next = patch?.trim() ? `${patch.replace(/\s*$/, "\n")}${DSH_PATCH}` : DSH_PATCH;
    await mkdir(path.dirname(patchPath), { recursive: true });
    await writeFile(patchPath, next);
    written.push(patchPath);
  }
  return written;
}
