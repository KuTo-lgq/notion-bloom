/**
 * Reads a lecture deck. PDF text and page renders go through PyMuPDF.
 * A pptx uses the zip reader already in the project.
 */

import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { DeckSlide } from "./compose";
import { extractPptx } from "@/ppt/extract";

const PDF_SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "extract_pdf.py");

const TOOL_TIMEOUT_MS = 20_000;

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
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
    const ok = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", fail);
    child.on("close", (code) => {
      if (code === 0) ok();
      else fail(new Error(stderr.trim() || `${command} exited ${code}`));
    });
  });
}

function isEnoent(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === "ENOENT";
}

async function readPdf(filePath: string, imagePages: number[]): Promise<DeckSlide[]> {
  const dir = path.join(tmpdir(), `bloom-deck-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  const jsonPath = path.join(dir, "slides.json");
  const imageDir = path.join(dir, "images");
  await mkdir(imageDir, { recursive: true });
  const pages = imagePages.map(String);
  await run("python3", [PDF_SCRIPT, filePath, jsonPath, imageDir, ...pages]);
  const slides = JSON.parse(await readFile(jsonPath, "utf8")) as DeckSlide[];
  return slides;
}

async function readPptx(bytes: Buffer): Promise<DeckSlide[]> {
  let slides;
  try {
    slides = await extractPptx(bytes);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`打不开课件：这不是有效的 .pptx。（${detail}）`);
  }
  if (slides.length === 0) throw new Error("课件里没有幻灯片。");
  const dir = path.join(tmpdir(), `bloom-deck-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  const out: DeckSlide[] = [];
  for (const slide of slides) {
    const lines = slide.text
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
    let imageFile: string | null = null;
    const image = slide.images[0];
    if (image) {
      const match = image.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        const ext = match[1].includes("png") ? "png" : "jpg";
        imageFile = path.join(dir, `p${slide.number}.${ext}`);
        await writeFile(imageFile, Buffer.from(match[2], "base64"));
      }
    }
    out.push({
      number: slide.number,
      footer: "",
      lines: lines.length > 0 ? lines : [slide.text],
      drawings: image ? 8 : 0,
      images: image ? 1 : 0,
      imageFile,
    });
  }
  return out;
}

export async function readDeckFile(filePath: string, imagePages: number[] = []): Promise<DeckSlide[]> {
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== ".pdf" && ext !== ".pptx") {
    throw new Error(`课件需要是 .pdf 或 .pptx，收到的是 ${ext || "无扩展名"}。`);
  }
  let bytes: Buffer;
  try {
    bytes = await readFile(filePath);
  } catch (error) {
    if (isEnoent(error)) throw new Error(`找不到课件：${filePath}`);
    throw error;
  }
  if (bytes.length === 0) throw new Error("课件是空文件。");
  if (ext === ".pdf") return readPdf(filePath, imagePages);
  return readPptx(bytes);
}
