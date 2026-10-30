/**
 * Renders each slide of a real pptx to a PNG.
 * Embedded 1-pixel pictures are not slide screenshots and are ignored.
 */

import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const TOOL_TIMEOUT_MS = 20_000;

function spawnText(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      fail(new Error(`${command} 超时`));
    }, TOOL_TIMEOUT_MS);
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    };
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", fail);
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || `${command} exited ${code}`));
    });
  });
}

function run(command: string, args: string[]): Promise<void> {
  return spawnText(command, args).then(() => undefined);
}

/** A screenshot of a slide, not a 1-pixel placeholder. */
export function isRealSlideImage(bytes: Buffer): boolean {
  if (bytes.length < 24 || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") return false;
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  return width >= 320 && height >= 180;
}

export async function renderPdfSlides(pdfPath: string): Promise<Map<number, string>> {
  const dir = await mkdtemp(path.join(tmpdir(), "bloom-pdf-"));
  const script = `
import pymupdf, json, sys
doc = pymupdf.open(sys.argv[1])
out = {}
for i, page in enumerate(doc):
    pix = page.get_pixmap(matrix=pymupdf.Matrix(1.2, 1.2), alpha=False)
    path = sys.argv[2] + f"/slide-{i+1}.png"
    pix.save(path)
    out[i+1] = path
print(json.dumps(out))
`;
  const json = await spawnText("python3", ["-c", script, pdfPath, dir]);
  const paths = JSON.parse(json) as Record<string, string>;
  const real = new Map<number, string>();
  for (const [number, file] of Object.entries(paths)) {
    const bytes = await readFile(file);
    if (isRealSlideImage(bytes)) real.set(Number(number), file);
  }
  return real;
}

export async function renderPptxSlides(pptxPath: string): Promise<Map<number, string>> {
  const dir = await mkdtemp(path.join(tmpdir(), "bloom-render-"));
  const profile = path.join(dir, "profile");
  await run("soffice", [
    "--headless",
    "--norestore",
    "--nolockcheck",
    `-env:UserInstallation=file://${profile}`,
    "--convert-to",
    "pdf",
    "--outdir",
    dir,
    pptxPath,
  ]);
  const pdfName = (await readdir(dir)).find((name) => name.endsWith(".pdf"));
  if (!pdfName) return new Map();
  const script = `
import pymupdf, json, sys
doc = pymupdf.open(sys.argv[1])
out = {}
for i, page in enumerate(doc):
    pix = page.get_pixmap(matrix=pymupdf.Matrix(1.2, 1.2), alpha=False)
    path = sys.argv[2] + f"/slide-{i+1}.png"
    pix.save(path)
    out[i+1] = path
print(json.dumps(out))
`;
  const json = await spawnText("python3", ["-c", script, path.join(dir, pdfName), dir]);
  const paths = JSON.parse(json) as Record<string, string>;
  const real = new Map<number, string>();
  for (const [number, file] of Object.entries(paths)) {
    const bytes = await readFile(file);
    if (isRealSlideImage(bytes)) real.set(Number(number), file);
  }
  return real;
}
