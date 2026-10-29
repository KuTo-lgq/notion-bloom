"""Read a lecture PDF into slide records. Renders only the page numbers it is given."""

import json
import sys

import pymupdf


def lines_of(page: pymupdf.Page) -> list[str]:
    raw = page.get_text("text").splitlines()
    return [line.strip() for line in raw if line.strip()]


def main() -> None:
    pdf_path, out_path = sys.argv[1], sys.argv[2]
    image_dir = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] != "-" else None
    wanted = {int(value) for value in sys.argv[4:]}
    doc = pymupdf.open(pdf_path)
    slides = []
    for index, page in enumerate(doc):
        number = index + 1
        body = lines_of(page)
        footer = next((line for line in reversed(body) if "/" in line and line.replace("/", "").replace(" ", "").isdigit()), "")
        image_file = None
        if image_dir and number in wanted:
            pix = page.get_pixmap(matrix=pymupdf.Matrix(1.7, 1.7), alpha=False)
            image_file = f"{image_dir}/p{number:03d}.jpg"
            pix.save(image_file, jpg_quality=82)
        slides.append(
            {
                "number": number,
                "footer": footer,
                "lines": body,
                "drawings": len(page.get_drawings()),
                "images": len(page.get_images()),
                "imageFile": image_file,
            }
        )
    with open(out_path, "w", encoding="utf-8") as handle:
        json.dump(slides, handle, ensure_ascii=False)


if __name__ == "__main__":
    main()
