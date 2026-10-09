"""Turns the four start-page photos into the small WebP files the app serves.

    python scripts/make-redesign-images.py                 (reads public/images/redesign/*.jpg)
    python scripts/make-redesign-images.py --src DIR --out DIR

Input names: hero2.jpg, desk.jpg, tablet.jpg, notes.jpg. Each is centre-cropped to the shape the page uses (so the
page knows every width and height in advance and nothing jumps when a photo loads) and saved as WebP:

    hero-720.webp                        (shape 4:5; add 1440 to JOBS for a 2x file when the original is big enough)
    desk-632.webp, tablet-632.webp, notes-632.webp   (shape 4:3)

The originals are moved to frontend/.photo-originals/ (git-ignored) so the big files are not copied into the build.
Needs Pillow (pip install pillow). The sizes here must match src/lib/landingImages.ts.
"""
from __future__ import annotations

import argparse
import shutil
from pathlib import Path

from PIL import Image, ImageOps

HERE = Path(__file__).resolve().parent.parent

# input name -> (output name, [widths], height / width, where the subject is across the picture: 0 = left edge, 1 = right edge)
# The current originals are small (the hero is 1100x943, the others 900x474), so only widths they can fill are listed:
# making a 2x file from them would only be a blurry copy that is bigger to download.
JOBS = {
    "hero2": ("hero", [720], 1.25, 0.62),
    "desk": ("desk", [632], 0.75, 0.55),
    "tablet": ("tablet", [632], 0.75, 0.45),
    "notes": ("notes", [632], 0.75, 0.55),
}


def crop_to_ratio(img: Image.Image, ratio: float, focus: float = 0.5) -> Image.Image:
    w, h = img.size
    if h / w > ratio:  # too tall: trim top and bottom
        new_h = round(w * ratio)
        top = (h - new_h) // 2
        return img.crop((0, top, w, top + new_h))
    new_w = round(h / ratio)  # too wide: trim the sides
    left = round(min(max(focus * w - new_w / 2, 0), w - new_w))  # centre on the subject, but stay inside the picture
    return img.crop((left, 0, left + new_w, h))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--src", type=Path, default=HERE / "public" / "images" / "redesign")
    parser.add_argument("--out", type=Path, default=None, help="where the WebP files go (default: same folder as --src)")
    parser.add_argument("--originals", type=Path, default=HERE / ".photo-originals", help="where the source JPGs are moved")
    parser.add_argument("--keep", action="store_true", help="leave the originals where they are")
    args = parser.parse_args()
    out = args.out or args.src
    out.mkdir(parents=True, exist_ok=True)

    missing = [name for name in JOBS if not (args.src / f"{name}.jpg").exists()]
    if missing:
        raise SystemExit(f"Missing in {args.src}: {', '.join(n + '.jpg' for n in missing)}")

    for name, (stem, widths, ratio, focus) in JOBS.items():
        source = args.src / f"{name}.jpg"
        with Image.open(source) as opened:
            img = crop_to_ratio(ImageOps.exif_transpose(opened).convert("RGB"), ratio, focus)
        for width in widths:
            height = round(width * ratio)
            if img.width < width:
                print(f"  skipped {stem}-{width}.webp: {source.name} is only {img.width}px wide once cropped (a bigger copy would only be blurry)")
                continue
            resized = img.resize((width, height), Image.LANCZOS)
            target = out / f"{stem}-{width}.webp"
            resized.save(target, "WEBP", quality=80, method=6)
            print(f"{target.name}: {width}x{height}, {target.stat().st_size // 1024} KB")

    if not args.keep:
        args.originals.mkdir(parents=True, exist_ok=True)
        for name in JOBS:
            shutil.move(str(args.src / f"{name}.jpg"), str(args.originals / f"{name}.jpg"))
        print(f"Originals moved to {args.originals}")


if __name__ == "__main__":
    main()
