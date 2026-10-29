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

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `${command} exited ${code}`));
    });
  });
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

async function readPptx(filePath: string): Promise<DeckSlide[]> {
  const slides = await extractPptx(await readFile(filePath));
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
  if (ext === ".pdf") return readPdf(filePath, imagePages);
  if (ext === ".pptx") return readPptx(filePath);
  throw new Error("课件需要是 .pdf 或 .pptx。");
}
