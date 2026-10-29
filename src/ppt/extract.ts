/**
 * Reads figures out of a .pptx file.
 *
 * A pptx is a zip. Slide text lives in `ppt/slides/slideN.xml`, and each
 * picture points at a file under `ppt/media/` through the slide's rels.
 * This does not need PowerPoint to be installed.
 */

import JSZip from "jszip";

export type PptImage = {
  fileName: string;
  mime: string;
  dataUrl: string;
};

export type PptSlide = {
  number: number;
  text: string;
  images: PptImage[];
};

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function slideNumber(path: string): number | null {
  const match = path.match(/ppt\/slides\/slide(\d+)\.xml$/);
  return match ? Number(match[1]) : null;
}

/** `ppt/slides/_rels/slide1.xml.rels` + `../media/image1.png` → `ppt/media/image1.png`. */
export function resolveZipPath(from: string, target: string): string {
  const base = from.split("/").slice(0, -1);
  const parts = target.split("/");
  const stack = [...base];
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  return stack.join("/");
}

export async function extractPptx(bytes: Uint8Array | ArrayBuffer): Promise<PptSlide[]> {
  const zip = await JSZip.loadAsync(bytes);
  const slidePaths = Object.keys(zip.files)
    .map((path) => ({ path, number: slideNumber(path) }))
    .filter((item): item is { path: string; number: number } => item.number !== null)
    .sort((a, b) => a.number - b.number);

  const slides: PptSlide[] = [];
  for (const { path, number } of slidePaths) {
    const xml = await zip.file(path)?.async("string");
    if (!xml) continue;
    const texts = [...xml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)].map((match) => decodeXml(match[1]));
    const embeds = [...xml.matchAll(/r:embed="([^"]+)"/g)].map((match) => match[1]);
    const relsPath = path.replace("ppt/slides/", "ppt/slides/_rels/") + ".rels";
    const relsXml = (await zip.file(relsPath)?.async("string")) ?? "";
    const targets = new Map<string, string>();
    for (const match of relsXml.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
      targets.set(match[1], match[2]);
    }
    // Some writers put Target before Id.
    for (const match of relsXml.matchAll(/Target="([^"]+)"[^>]*Id="([^"]+)"/g)) {
      targets.set(match[2], match[1]);
    }

    const images: PptImage[] = [];
    for (const embed of embeds) {
      const target = targets.get(embed);
      if (!target) continue;
      const mediaPath = resolveZipPath(path, target);
      const file = zip.file(mediaPath);
      if (!file) continue;
      const raw = await file.async("uint8array");
      const ext = mediaPath.split(".").pop()?.toLowerCase() ?? "png";
      const mime = MIME[ext] ?? "application/octet-stream";
      if (!mime.startsWith("image/")) continue;
      images.push({
        fileName: mediaPath.split("/").pop() ?? mediaPath,
        mime,
        dataUrl: `data:${mime};base64,${Buffer.from(raw).toString("base64")}`,
      });
    }

    slides.push({ number, text: texts.map((item) => item.trim()).filter(Boolean).join("\n"), images });
  }
  return slides;
}
