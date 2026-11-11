#!/usr/bin/env python3
"""Regenerate splash screens and launcher icons from public/kakeibo.png."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public" / "kakeibo.png"

BASE = (243, 241, 235)
ACCENT_SOFT = (228, 233, 225)
SHADOW = (49, 56, 49, 38)
LINE = (52, 61, 53, 28)

ANDROID_RES = ROOT / "android" / "app" / "src" / "main" / "res"
MIPMAP_DP = {
    "mdpi": 1,
    "hdpi": 1.5,
    "xhdpi": 2,
    "xxhdpi": 3,
    "xxxhdpi": 4,
}
SPLASH_SCREENS = {
    "drawable-port-mdpi": (480, 800),
    "drawable-port-hdpi": (720, 1280),
    "drawable-port-xhdpi": (960, 1600),
    "drawable-port-xxhdpi": (1440, 2400),
    "drawable-port-xxxhdpi": (1920, 3200),
    "drawable-land-mdpi": (800, 480),
    "drawable-land-hdpi": (1280, 720),
    "drawable-land-xhdpi": (1600, 960),
    "drawable-land-xxhdpi": (2400, 1440),
    "drawable-land-xxxhdpi": (3200, 1920),
}


def load_logo() -> Image.Image:
    return Image.open(SOURCE).convert("RGBA")


def rounded_rect(size: int, radius: float, fill: tuple[int, ...]) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=fill)
    return img


def paste_centered(canvas: Image.Image, layer: Image.Image, top: int | None = None) -> None:
    x = (canvas.width - layer.width) // 2
    y = top if top is not None else (canvas.height - layer.height) // 2
    canvas.alpha_composite(layer, (x, y))


def scale_logo(logo: Image.Image, target: int) -> Image.Image:
    bbox = logo.getchannel("A").getbbox()
    if not bbox:
        return logo.resize((target, target), Image.Resampling.LANCZOS)
    cropped = logo.crop(bbox)
    w, h = cropped.size
    scale = target / max(w, h)
    new_w = max(1, round(w * scale))
    new_h = max(1, round(h * scale))
    return cropped.resize((new_w, new_h), Image.Resampling.LANCZOS)


def render_mark(logo: Image.Image, size: int, *, logo_ratio: float = 0.52, plate_ratio: float = 0.78) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    plate_size = max(8, round(size * plate_ratio))
    radius = plate_size * 0.36
    plate = rounded_rect(plate_size, radius, ACCENT_SOFT + (255,))
    plate_outline = rounded_rect(plate_size, radius, (0, 0, 0, 0))
    outline = ImageDraw.Draw(plate_outline)
    outline.rounded_rectangle(
        (0.5, 0.5, plate_size - 1.5, plate_size - 1.5),
        radius=radius,
        outline=LINE,
        width=max(1, round(size * 0.006)),
    )
    plate = Image.alpha_composite(plate, plate_outline)

    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    shadow_plate = plate.copy()
    offset = max(1, round(size * 0.018))
    shadow.alpha_composite(shadow_plate, (0, offset))
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=max(1, size * 0.028)))
    shadow = ImageChops.multiply(shadow, Image.new("RGBA", shadow.size, SHADOW))

    logo_layer = scale_logo(logo, round(size * logo_ratio))
    stack = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    paste_centered(stack, shadow)
    paste_centered(stack, plate)
    paste_centered(stack, logo_layer)
    canvas.alpha_composite(stack)
    return canvas


def render_on_base(logo: Image.Image, size: int, **kwargs) -> Image.Image:
    base = Image.new("RGBA", (size, size), BASE + (255,))
    mark = render_mark(logo, size, **kwargs)
    base.alpha_composite(mark)
    return base


def render_splash(logo: Image.Image, width: int, height: int) -> Image.Image:
    base = Image.new("RGB", (width, height), BASE)
    mark_size = round(min(width, height) * 0.34)
    mark = render_on_base(logo, mark_size)
    overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    paste_centered(overlay, mark)
    base.paste(overlay, mask=overlay.split()[3])
    return base


def save_png(path: Path, image: Image.Image) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if image.mode == "RGBA" and "foreground" in path.name:
        image.save(path, optimize=True)
    else:
        image.convert("RGB").save(path, optimize=True)


def write_svg(path: Path, png_path: Path) -> None:
    # Favicon SVG: padded mark on app base color (works in light browser chrome).
    path.write_text(
        f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#F3F1EB"/>
  <rect x="56" y="56" width="400" height="400" rx="144" fill="#E4E9E1" stroke="rgba(52,61,53,.12)" stroke-width="4"/>
  <image href="{png_path.name}" x="112" y="112" width="288" height="288" preserveAspectRatio="xMidYMid meet" />
</svg>
""",
        encoding="utf-8",
    )


def main() -> None:
    logo = load_logo()

    for density, scale in MIPMAP_DP.items():
        fg_size = round(108 * scale)
        launcher_size = round(48 * scale)
        fg = render_mark(logo, fg_size)
        save_png(ANDROID_RES / f"mipmap-{density}" / "ic_launcher_foreground.png", fg)

        launcher = Image.new("RGBA", (launcher_size, launcher_size), BASE + (255,))
        inset = render_mark(logo, launcher_size)
        launcher.alpha_composite(inset)
        save_png(ANDROID_RES / f"mipmap-{density}" / "ic_launcher.png", launcher)
        save_png(ANDROID_RES / f"mipmap-{density}" / "ic_launcher_round.png", launcher)

    save_png(ANDROID_RES / "drawable" / "splash.png", render_on_base(logo, 512))

    for folder, (width, height) in SPLASH_SCREENS.items():
        save_png(ANDROID_RES / folder / "splash.png", render_splash(logo, width, height))

    save_png(ROOT / "desktop" / "build" / "icon.png", render_on_base(logo, 512))

    touch = render_on_base(logo, 512)
    save_png(ROOT / "public" / "kakeibo-app-icon.png", touch)
    write_svg(ROOT / "public" / "kakeibo.svg", Path("kakeibo.png"))

    ico_path = ROOT / "desktop" / "build" / "icon.ico"
    png_path = ROOT / "desktop" / "build" / "icon.png"
    if shutil.which("convert"):
        subprocess.run(
            ["convert", str(png_path), "-define", "icon:auto-resize=256,128,64,48,32,16", str(ico_path)],
            check=True,
        )
    print("Brand assets generated.")

if __name__ == "__main__":
    main()
