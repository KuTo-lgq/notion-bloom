"""Build a small lecture deck whose figures illustrate the Bayes sample page."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from pptx import Presentation
from pptx.util import Inches

OUT = Path("/tmp/bayes-figures")
PPTX = Path("/workspace/examples/bayes-lecture.pptx")
FONT = "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc"
INK = (55, 53, 47)
BLUE = (51, 126, 169)
PAPER = (247, 246, 243)
WHITE = (255, 255, 255)


def font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT, size)


def card(title: str, lines: list[tuple[str, str]]) -> Image.Image:
    image = Image.new("RGB", (1400, 780), WHITE)
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 1399, 779), outline=(220, 218, 214), width=2)
    draw.rectangle((0, 0, 1399, 92), fill=PAPER)
    draw.text((48, 22), title, font=font(40), fill=INK)
    x = 48
    for label, value in lines:
        draw.rounded_rectangle((x, 160, x + 300, 640), radius=16, fill=PAPER)
        draw.text((x + 28, 200), label, font=font(28), fill=BLUE)
        draw.text((x + 28, 280), value, font=font(54), fill=INK)
        x += 332
    return image


def formula_card() -> Image.Image:
    image = Image.new("RGB", (1400, 780), WHITE)
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 1399, 92), fill=PAPER)
    draw.text((48, 22), "公式", font=font(40), fill=INK)
    draw.text((80, 180), "后验", font=font(32), fill=BLUE)
    draw.text((80, 240), "P(A|B)", font=font(64), fill=INK)
    draw.text((430, 250), "=", font=font(64), fill=INK)
    draw.text((520, 160), "似然 × 先验", font=font(32), fill=BLUE)
    draw.text((520, 230), "P(B|A) · P(A)", font=font(48), fill=INK)
    draw.line((520, 320, 1100, 320), fill=INK, width=3)
    draw.text((520, 350), "证据  P(B)", font=font(48), fill=INK)
    draw.text((80, 520), "先写联合概率，再除以边缘概率。", font=font(32), fill=INK)
    return image


def error_card() -> Image.Image:
    image = Image.new("RGB", (1400, 780), WHITE)
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 1399, 92), fill=PAPER)
    draw.text((48, 22), "常见错误", font=font(40), fill=INK)
    draw.rounded_rectangle((80, 180, 620, 620), radius=16, fill=PAPER)
    draw.rounded_rectangle((760, 180, 1300, 620), radius=16, fill=(231, 243, 248))
    draw.text((120, 230), "先验", font=font(32), fill=BLUE)
    draw.text((120, 310), "P(A)", font=font(72), fill=INK)
    draw.text((120, 460), "得病之前就有的概率", font=font(28), fill=INK)
    draw.text((800, 230), "后验", font=font(32), fill=BLUE)
    draw.text((800, 310), "P(A|B)", font=font(72), fill=INK)
    draw.text((800, 460), "阳性结果更新的是这一边", font=font(28), fill=INK)
    return image


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    figures = {
        "公式": formula_card(),
        "发病检测": card(
            "发病检测",
            [("患病率", "1%"), ("灵敏度", "99%"), ("假阳性", "5%"), ("后验", "约 17%")],
        ),
        "常见错误": error_card(),
    }
    presentation = Presentation()
    presentation.slide_width = Inches(13.333)
    presentation.slide_height = Inches(7.5)
    blank = presentation.slide_layouts[6]
    for title, image in figures.items():
        path = OUT / f"{title}.png"
        image.save(path)
        slide = presentation.slides.add_slide(blank)
        slide.shapes.add_picture(str(path), Inches(0.4), Inches(0.3), Inches(12.5), Inches(6.9))
        # The picture has no text body. A title box keeps the slide matchable
        # even if a reader strips the pixels.
        box = slide.shapes.add_textbox(Inches(0.4), Inches(0.15), Inches(6), Inches(0.4))
        box.text_frame.text = title
    PPTX.parent.mkdir(parents=True, exist_ok=True)
    presentation.save(PPTX)


if __name__ == "__main__":
    main()
