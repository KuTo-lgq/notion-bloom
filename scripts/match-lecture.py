"""Turn the reference lecture markdown into publishable blocks, with slide images."""

import json
import re
import sys

FETCH = sys.argv[1]
OUT = sys.argv[2]

COLOR = {
    "gray_bg": "gray_background",
    "blue_bg": "blue_background",
    "yellow_bg": "yellow_background",
    "orange_bg": "orange_background",
    "red_bg": "red_background",
    "green_bg": "green_background",
    "brown_bg": "brown_background",
    "purple_bg": "purple_background",
    "pink_bg": "pink_background",
    "default": "default",
}


def rich_of(raw: str) -> list[dict]:
    text = raw.replace("<br />", "\n").replace("<br/>", "\n").replace("<br>", "\n")
    text = re.sub(r"</?i>", "", text)
    text = text.replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&")
    pattern = re.compile(r"</?b>|<code>|</code>|`[^`]*`|\$[^$\n]+\$")
    parts: list[dict] = []
    bold = False
    code = False
    pos = 0
    for match in pattern.finditer(text):
        if match.start() > pos:
            parts.append({"text": text[pos : match.start()], "bold": bold, "code": code})
        token = match.group(0)
        if token == "<b>":
            bold = True
        elif token == "</b>":
            bold = False
        elif token == "<code>":
            code = True
        elif token == "</code>":
            code = False
        elif token.startswith("`"):
            parts.append({"text": token[1:-1], "code": True})
        elif token.startswith("$"):
            parts.append({"equation": token[1:-1].strip()})
        pos = match.end()
    if pos < len(text):
        parts.append({"text": text[pos:], "bold": bold, "code": code})
    cleaned = []
    for part in parts:
        if part.get("equation"):
            if part["equation"]:
                cleaned.append(part)
            continue
        value = part.get("text", "")
        if value == "":
            continue
        cleaned.append(part)
    return cleaned or [{"text": ""}]


def plain(parts: list[dict]) -> str:
    return "".join(part.get("equation", part.get("text", "")) for part in parts).strip()


def blocks_from(body: str) -> list[dict]:
    lines = body.splitlines()
    blocks: list[dict] = []
    i = 0

    def push_para(buf: list[str]) -> None:
        text = "\n".join(buf).strip()
        if not text:
            return
        if text.startswith("|") and "|" in text[1:]:
            return
        only = text.strip()
        if only.startswith("$$") and only.endswith("$$"):
            blocks.append({"type": "equation", "expression": only.strip("$").strip()})
            return
        math = re.fullmatch(r"\$([^$]+)\$", only)
        if math and "\n" not in only:
            blocks.append({"type": "equation", "expression": math.group(1).strip()})
            return
        blocks.append({"type": "paragraph", "rich": rich_of(text)})

    while i < len(lines):
        line = lines[i]
        if not line.strip():
            i += 1
            continue
        if line.startswith("<table-of-contents"):
            blocks.append({"type": "toc"})
            i += 1
            continue
        if line.strip() == "---":
            blocks.append({"type": "divider"})
            i += 1
            continue
        if line.startswith("```"):
            lang = line.strip("`").strip() or "plain text"
            i += 1
            code: list[str] = []
            while i < len(lines) and not lines[i].startswith("```"):
                code.append(lines[i])
                i += 1
            i += 1
            blocks.append({"type": "code", "language": "plain text", "text": "\n".join(code)})
            continue
        if line.startswith("<image"):
            chunk = [line]
            i += 1
            while i < len(lines) and "</image>" not in lines[i - 1]:
                chunk.append(lines[i])
                i += 1
            blob = "\n".join(chunk)
            caption = re.sub(r"</?image[^>]*>", "", blob).strip()
            page = re.search(r"课件第\s*(\d+)\s*页", caption)
            blocks.append(
                {
                    "type": "image",
                    "pdfPage": int(page.group(1)) if page else None,
                    "caption": plain(rich_of(caption)) or caption,
                }
            )
            continue
        if line.startswith("<callout"):
            icon = re.search(r'icon="([^"]+)"', line)
            color = re.search(r'color="([^"]+)"', line)
            i += 1
            inner: list[str] = []
            while i < len(lines) and lines[i].strip() != "</callout>":
                inner.append(lines[i])
                i += 1
            i += 1
            children = blocks_from("\n".join(inner))
            emoji = icon.group(1) if icon else "💡"
            blocks.append(
                {
                    "type": "callout",
                    "emoji": emoji,
                    "color": COLOR.get(color.group(1) if color else "gray_bg", "gray_background"),
                    "children": children,
                }
            )
            continue
        if line.startswith("#"):
            level = len(line) - len(line.lstrip("#"))
            title = line[level:].strip()
            kind = "heading_1" if level <= 1 else "heading_2" if level == 2 else "heading_3"
            blocks.append({"type": kind, "rich": rich_of(title)})
            i += 1
            continue
        if line.startswith("|"):
            rows: list[list[str]] = []
            while i < len(lines) and lines[i].startswith("|"):
                rows.append(lines[i])
                i += 1
            parsed = []
            for row in rows:
                if re.match(r"^\|\s*-+", row):
                    continue
                cells = [cell.strip() for cell in row.strip().strip("|").split("|")]
                parsed.append([rich_of(cell) for cell in cells])
            if parsed:
                width = max(len(row) for row in parsed)
                for row in parsed:
                    while len(row) < width:
                        row.append([{"text": ""}])
                blocks.append({"type": "table", "width": width, "rows": parsed})
            continue
        if re.match(r"^\s*[-*] ", line):
            blocks.append({"type": "bulleted_list_item", "rich": rich_of(re.sub(r"^\s*[-*] ", "", line))})
            i += 1
            continue
        buf = [line]
        i += 1
        while i < len(lines) and lines[i].strip() and not lines[i].startswith(("#", "|", "<", "-", "*", "```")) and lines[i].strip() != "---":
            buf.append(lines[i])
            i += 1
        push_para(buf)
    return blocks


def main() -> None:
    payload = json.loads(open(FETCH, encoding="utf-8").read())
    body = payload["text"].split("<content>", 1)[1].split("</content>", 1)[0]
    blocks = blocks_from(body.strip("\n"))
    json.dump({"title": "课件生成｜L02 梯度下降、SGD 与损失函数", "blocks": blocks}, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
    print("blocks", len(blocks), "images", sum(1 for block in blocks if block["type"] == "image"))


if __name__ == "__main__":
    main()
