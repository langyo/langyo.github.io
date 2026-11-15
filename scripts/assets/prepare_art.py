#!/usr/bin/env python3
"""Derive the hikari-zola site artwork from the original Blue Archive sources.

Hero background note: since v2 the hero right-hand figure is the WebGL2 holographic
point-cloud railgun RG-SUPERNOVA rendered by the theme backdrop, so no raster hero
figure is derived here.

Inputs (read-only, never published; kept in the repo as original assets):
    assets/source/alice_1.webp   Alice, winking    (2274x1608)
    assets/source/arona_0.webp   Arona + Plana     (1920x1200)

Outputs (all under static/img/ -- the only raster assets that ship with the site):
    alice-badge.webp      400x400   square avatar for the operator dossier
    arona-side.webp       800x500   side decoration for /about/ and 404
    sword-mark.svg        "light sword" symbol (currentColor)
    millennium-mark.svg   Millennium "M" emblem (currentColor)
    silhouette-alice.svg  abstract Alice silhouette (currentColor)

Design rules (see _dsh_scratch/hikari-zola-spec.md section 8):
* light-blue duotone, <= 300 KB per raster image;
* the SVGs are single-colour (currentColor) hand written minimal vectors;
* deterministic and idempotent: the same sources always produce byte-identical
  outputs, so re-running the script is a no-op for git.

Usage:
    python scripts/assets/prepare_art.py
    python scripts/assets/prepare_art.py --check   # verify outputs exist

Requires Pillow (use the bundled runtime python from load_workspace_dependencies).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[2]
#: Original artwork lives outside static/ so zola never publishes it.
SOURCE = ROOT / "assets" / "source"
DST = ROOT / "static" / "img"

MAX_BYTES = 300 * 1024
QUALITY_STEPS = (84, 80, 76, 72, 68, 64)

# Duotone ramp: shadow -> highlight.  Kept inside the hikari light-blue family
# so the derived figures blend with the near-white page and --color-primary glow.
BADGE_SHADOW = (44, 104, 168)
BADGE_HIGHLIGHT = (250, 253, 255)
ARONA_SHADOW = (58, 122, 187)
ARONA_HIGHLIGHT = (250, 253, 255)


def _load(path: Path) -> Image.Image:
    if not path.is_file():
        raise SystemExit("missing source image: " + str(path))
    return Image.open(path).convert("RGB")


def crop_source(im: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    """Crop (left, top, right, bottom) from the source, validating the box."""
    left, top, right, bottom = box
    if not (0 <= left < right <= im.width and 0 <= top < bottom <= im.height):
        raise SystemExit("crop box " + str(box) + " outside source " + str(im.size))
    return im.crop(box)


def ramp_to_rgb(im: Image.Image, shadow: tuple[int, int, int], highlight: tuple[int, int, int]) -> Image.Image:
    """Autocontrasted luminance mapped through a shadow -> highlight ramp."""
    lum = ImageOps.autocontrast(im.convert("L"), cutoff=1)
    lut = [
        tuple(round(shadow[i] + (highlight[i] - shadow[i]) * (v / 255.0)) for i in range(3))
        for v in range(256)
    ]
    return Image.merge(
        "RGB",
        (
            lum.point([c[0] for c in lut]),
            lum.point([c[1] for c in lut]),
            lum.point([c[2] for c in lut]),
        ),
    )


def save_webp(im: Image.Image, out: Path) -> int:
    """Save with the highest quality step that stays within the size budget."""
    out.parent.mkdir(parents=True, exist_ok=True)
    last_size = 0
    for quality in QUALITY_STEPS:
        im.save(out, "WEBP", quality=quality, method=6, exact=True)
        last_size = out.stat().st_size
        if last_size <= MAX_BYTES:
            print("  " + str(out.relative_to(ROOT)) + "  " + str(im.width) + "x" + str(im.height)
                  + "  " + format(last_size / 1024, ".1f") + " KB  q=" + str(quality))
            return last_size
    raise SystemExit(str(out) + " is " + format(last_size / 1024, ".1f") + " KB at the lowest quality step")


def make_alice_badge() -> None:
    src = _load(SOURCE / "alice_1.webp")
    # Square crop: head, winking eyes and hands, then downscale to 400x400.
    crop = crop_source(src, (540, 120, 1740, 1320))
    badge = ramp_to_rgb(crop, BADGE_SHADOW, BADGE_HIGHLIGHT).resize((400, 400), Image.Resampling.LANCZOS)
    save_webp(badge, DST / "alice-badge.webp")


def make_arona_side() -> None:
    src = _load(SOURCE / "arona_0.webp")
    # Right-hand Arona with a hint of Plana on the left edge, 8:5.
    crop = crop_source(src, (640, 200, 1920, 1000))
    side = ramp_to_rgb(crop, ARONA_SHADOW, ARONA_HIGHLIGHT).resize((800, 500), Image.Resampling.LANCZOS)
    save_webp(side, DST / "arona-side.webp")


def svg_doc(body: str) -> str:
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" '
        'fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" '
        'stroke-linejoin="round" aria-hidden="true">' + "\n" + body + "</svg>" + "\n"
    )


SWORD_SVG = svg_doc(
    '  <!-- hikari-zola: light sword mark (straight blade, fuller, guard, grip) -->' + "\n"
    '  <path d="M12 1.8 13.9 5.2v9.1h-3.8V5.2z"/>' + "\n"
    '  <path d="M12 4.8v9.7"/>' + "\n"
    '  <path d="M7.4 14.3h9.2l-.8 2.2H8.2z"/>' + "\n"
    '  <path d="M10.8 16.5h2.4v3.3h-2.4z"/>' + "\n"
    '  <path d="M10.2 19.8h3.6L12 21.7z"/>' + "\n"
    '  <circle cx="12" cy="11.2" r="0.55" fill="currentColor" stroke="none"/>' + "\n"
)

MILLENNIUM_SVG = svg_doc(
    '  <!-- hikari-zola: Millennium academy emblem (hex frame + stylised M) -->' + "\n"
    '  <path d="M12 1.6 20.9 6.8v10.4L12 22.4 3.1 17.2V6.8z"/>' + "\n"
    '  <path d="M7.4 16.2V9.3L12 13.4l4.6-4.1v6.9"/>' + "\n"
    '  <path d="M7.4 9.3V7.1M16.6 9.3V7.1"/>' + "\n"
    '  <circle cx="12" cy="19.3" r="0.85" fill="currentColor" stroke="none"/>' + "\n"
)

SILHOUETTE_SVG = svg_doc(
    '  <!-- hikari-zola: abstract Alice silhouette (twin tails + headband + headset) -->' + "\n"
    '  <circle cx="12" cy="10.6" r="4.4"/>' + "\n"
    '  <path d="M7.8 8.4Q12 5.9 16.2 8.4"/>' + "\n"
    '  <path d="M7.9 12.1C5.7 12.8 4.8 16.4 5.4 20.2c1.5-1.6 2.3-4.2 2.6-6.6"/>' + "\n"
    '  <path d="M16.1 12.1c2.2.7 3.1 4.3 2.5 8.1-1.5-1.6-2.3-4.2-2.6-6.6"/>' + "\n"
    '  <path d="M8.1 7.9Q12 3.9 15.9 7.9"/>' + "\n"
    '  <rect x="5.9" y="9.5" width="2.1" height="3.9" rx="1"/>' + "\n"
    '  <rect x="16" y="9.5" width="2.1" height="3.9" rx="1"/>' + "\n"
)


def write_svgs() -> None:
    for name, content in (
        ("sword-mark.svg", SWORD_SVG),
        ("millennium-mark.svg", MILLENNIUM_SVG),
        ("silhouette-alice.svg", SILHOUETTE_SVG),
    ):
        out = DST / name
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(content, encoding="utf-8", newline="\n")
        print("  " + str(out.relative_to(ROOT)) + "  " + str(out.stat().st_size) + " bytes")


def expected_outputs() -> list[Path]:
    return [
        DST / "alice-badge.webp",
        DST / "arona-side.webp",
        DST / "sword-mark.svg",
        DST / "millennium-mark.svg",
        DST / "silhouette-alice.svg",
    ]


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="only verify that outputs exist")
    args = parser.parse_args(argv)

    if args.check:
        missing = [str(p.relative_to(ROOT)) for p in expected_outputs() if not p.is_file()]
        if missing:
            print("missing artwork: " + ", ".join(missing), file=sys.stderr)
            return 1
        for p in expected_outputs():
            print("ok  " + str(p.relative_to(ROOT)) + "  " + str(p.stat().st_size) + " bytes")
        return 0

    print("deriving site artwork -> " + str(DST.relative_to(ROOT)))
    make_alice_badge()
    make_arona_side()
    write_svgs()
    print("done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
