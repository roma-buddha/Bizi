"""Generate Bizi app icons (cream background, ink serif B)."""
import glob
import os

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICON_DIR = os.path.join(ROOT, "src-tauri", "icons")
os.makedirs(ICON_DIR, exist_ok=True)

CREAM = (247, 243, 234, 255)  # warm cream
INK = (43, 38, 32, 255)       # deep warm ink
ACCENT = (176, 102, 47, 255)  # warm accent


def find_font():
    patterns = [
        os.path.join(os.path.dirname(__import__("PIL").__file__), "..", "**", "DejaVuSerif-Bold.ttf"),
        os.path.join(os.path.dirname(__import__("PIL").__file__), "..", "**", "DejaVuSans-Bold.ttf"),
        "C:/Windows/Fonts/georgiab.ttf",
        "C:/Windows/Fonts/timesbd.ttf",
    ]
    for pattern in patterns:
        hits = glob.glob(pattern, recursive=True)
        if hits:
            return hits[0]
    raise SystemExit("no font found")


FONT_PATH = find_font()


def render(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    margin = size // 16
    draw.ellipse([margin, margin, size - margin, size - margin], fill=CREAM)
    # small accent dot, bottom right of the B baseline area
    dot = max(2, size // 28)
    draw.ellipse(
        [size * 0.66, size * 0.70, size * 0.66 + dot * 2, size * 0.70 + dot * 2],
        fill=ACCENT,
    )
    font = ImageFont.truetype(FONT_PATH, int(size * 0.58))
    bbox = draw.textbbox((0, 0), "B", font=font)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(
        ((size - w) / 2 - bbox[0], (size - h) / 2 - bbox[1]),
        "B",
        font=font,
        fill=INK,
    )
    return img


for name, size in [
    ("32x32.png", 32),
    ("64x64.png", 64),
    ("128x128.png", 128),
    ("128x128@2x.png", 256),
    ("icon.png", 512),
]:
    render(size).save(os.path.join(ICON_DIR, name))

render(256).save(
    os.path.join(ICON_DIR, "icon.ico"),
    sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
)

print("icons written to", ICON_DIR)
