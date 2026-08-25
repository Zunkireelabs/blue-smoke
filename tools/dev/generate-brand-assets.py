#!/usr/bin/env python3
"""
Generates the BlueSmoke brand-mark raster assets from one geometry definition —
docs/execution-briefs/P0-7.0-brand-mark-and-splash.md, "Geometry" table (geometry v2, the blue
flame). That table is the source of truth; this script only rasterises it. Re-run after any
geometry change. Output is deterministic (fixed-point drawing, fixed-segment bezier flattening,
no timestamps, no randomness) so a re-run with unchanged geometry produces byte-identical PNGs.

This is also the source of every future raster brand asset (PR 2's app icons included) — add a
new render_* / write_* pair rather than duplicating the geometry constants elsewhere.

Requires Pillow (execution brief decision 5 — approved for this script only):

    python3 -m venv tools/dev/.venv
    tools/dev/.venv/bin/pip install pillow
    tools/dev/.venv/bin/python3 tools/dev/generate-brand-assets.py
"""

import os

from PIL import Image, ImageDraw

# Mirrors src/shared/ui/tokens.ts (brandRaw.glow, brandRaw.base, neutral[0]). This script is
# plain Python and cannot import the TS module, so if those token values ever change, update the
# three hex strings below by hand at the same time.
GRADIENT_TOP = "#22C1F2"  # brandRaw.glow — 0% stop
GRADIENT_BOTTOM = "#1657D0"  # brandRaw.base — 100% stop
SURFACE = "#FFFFFF"  # the splash's ground colour — matches BrandMark's default `groundColor`

# 100x100 grid, brief "Geometry" table. Do not improvise these numbers.
GRID = 100

# Each path: a start point, then an ordered list of cubic bezier curves (c1, c2, end), mirroring
# the `M`/`C` commands in the brief exactly. Kept in sync by hand with the `OUTER_FLAME_PATH` /
# `INNER_FLAME_PATH` SVG path strings in src/shared/ui/BrandMark.tsx.
#
# Geometry v3 (brief: "v2 rendered as a water droplet, not a flame") — a narrow high neck
# flaring into a wide low belly.
OUTER_FLAME_START = (52, 4)
OUTER_FLAME_CURVES = [
    ((56, 16), (58, 24), (58, 32)),
    ((60, 44), (74, 50), (77, 63)),
    ((80, 80), (66, 93), (50, 93)),
    ((34, 93), (20, 80), (23, 63)),
    ((26, 50), (40, 44), (42, 32)),
    ((42, 24), (48, 14), (52, 4)),
]

INNER_FLAME_START = (50.4, 47.2)
INNER_FLAME_CURVES = [
    ((52.2, 52.7), (53.1, 56.4), (53.1, 60.1)),
    ((54.1, 65.6), (60.5, 68.4), (61.9, 74.3)),
    ((63.3, 82.2), (56.8, 88.1), (49.5, 88.1)),
    ((42.1, 88.1), (35.7, 82.2), (37, 74.3)),
    ((38.4, 68.4), (44.9, 65.6), (45.8, 60.1)),
    ((45.8, 56.4), (48.5, 52.7), (50.4, 47.2)),
]

# Fixed segments per curve, per the brief: NOT adaptive subdivision, whose segment count depends
# on floating-point comparisons and would not reproduce byte-identically across runs/machines.
SEGMENTS_PER_CURVE = 64

# Render at this multiple of the target size, then downsample with LANCZOS — Pillow has no
# native antialiasing for polygon fills, and the flame's long diagonal edges alias visibly at
# @1x without it (brief, "Pillow" section).
SUPERSAMPLE = 4

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _hex_to_rgb(value: str) -> tuple:
    value = value.lstrip("#")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))


def _cubic_point(p0: tuple, p1: tuple, p2: tuple, p3: tuple, t: float) -> tuple:
    mt = 1 - t
    x = mt**3 * p0[0] + 3 * mt**2 * t * p1[0] + 3 * mt * t**2 * p2[0] + t**3 * p3[0]
    y = mt**3 * p0[1] + 3 * mt**2 * t * p1[1] + 3 * mt * t**2 * p2[1] + t**3 * p3[1]
    return (x, y)


def flatten_path(start: tuple, curves: list) -> list:
    """Evaluates each cubic curve at SEGMENTS_PER_CURVE fixed steps and returns the resulting
    polygon points, in order, starting at `start`."""
    points = [start]
    current = start
    for c1, c2, end in curves:
        for i in range(1, SEGMENTS_PER_CURVE + 1):
            t = i / SEGMENTS_PER_CURVE
            points.append(_cubic_point(current, c1, c2, end, t))
        current = end
    return points


def _lerp_color(c1: tuple, c2: tuple, t: float) -> tuple:
    return tuple(round(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))


def _render_gradient(hi: int, top: float, bottom: float) -> Image.Image:
    """Vertical gradient over the full hi x hi canvas, interpolated per-scanline between
    GRADIENT_TOP (at `top`) and GRADIENT_BOTTOM (at `bottom`) — brief: "x1=0 y1=0 x2=0 y2=1"."""
    grad = Image.new("RGB", (hi, hi), _hex_to_rgb(GRADIENT_BOTTOM))
    draw = ImageDraw.Draw(grad)
    span = max(bottom - top, 1.0)
    for y in range(hi):
        t = min(max((y - top) / span, 0.0), 1.0)
        draw.line([(0, y), (hi, y)], fill=_lerp_color(_hex_to_rgb(GRADIENT_TOP), _hex_to_rgb(GRADIENT_BOTTOM), t))
    return grad


def render_mark(size_px: int) -> Image.Image:
    """Renders the mark at rest (brief: "bars are static rectangles" — here, the inner flame at
    its authored, undistorted geometry; the live component animates it via Animated.View, not
    as part of this raster)."""
    scale = (size_px * SUPERSAMPLE) / GRID
    hi = size_px * SUPERSAMPLE

    outer_points = [(x * scale, y * scale) for x, y in flatten_path(OUTER_FLAME_START, OUTER_FLAME_CURVES)]
    inner_points = [(x * scale, y * scale) for x, y in flatten_path(INNER_FLAME_START, INNER_FLAME_CURVES)]

    outer_mask = Image.new("L", (hi, hi), 0)
    ImageDraw.Draw(outer_mask).polygon(outer_points, fill=255)

    inner_mask = Image.new("L", (hi, hi), 0)
    ImageDraw.Draw(inner_mask).polygon(inner_points, fill=255)

    outer_ys = [p[1] for p in outer_points]
    gradient = _render_gradient(hi, min(outer_ys), max(outer_ys))

    img = Image.new("RGBA", (hi, hi), (0, 0, 0, 0))
    img.paste(gradient, (0, 0), outer_mask)

    ground_layer = Image.new("RGBA", (hi, hi), _hex_to_rgb(SURFACE) + (255,))
    img.paste(ground_layer, (0, 0), inner_mask)

    return img.resize((size_px, size_px), Image.LANCZOS)


def write_imageset(out_dir: str, base_name: str, sizes_px: dict) -> None:
    """sizes_px: {'1x': int, '2x': int, '3x': int}. Writes an Xcode-standard imageset —
    Contents.json plus one PNG per scale."""
    os.makedirs(out_dir, exist_ok=True)

    images = []
    for scale in ("1x", "2x", "3x"):
        px = sizes_px[scale]
        filename = f"{base_name}.png" if scale == "1x" else f"{base_name}@{scale}.png"
        render_mark(px).save(os.path.join(out_dir, filename))
        images.append({"idiom": "universal", "filename": filename, "scale": scale})

    contents = {
        "images": images,
        "info": {"author": "xcode", "version": 1},
    }
    _write_json(os.path.join(out_dir, "Contents.json"), contents)


def _write_json(path: str, data: dict) -> None:
    import json

    # sort_keys + fixed separators so re-runs with unchanged data produce byte-identical files.
    with open(path, "w") as f:
        f.write(json.dumps(data, indent=2, sort_keys=False))
        f.write("\n")


def main() -> None:
    # @1x = 120pt. The mark ever displays at ~22% of screen width (≈80-95pt on real devices,
    # see the brief's Placement section), so 120pt @3x = 360px gives headroom above that without
    # shipping an oversized asset.
    storyboard_dir = os.path.join(
        REPO_ROOT, "ios", "BlueSmoke", "Images.xcassets", "BrandMark.imageset"
    )
    write_imageset(storyboard_dir, "BrandMark", {"1x": 120, "2x": 240, "3x": 360})
    print(f"Wrote {storyboard_dir}")


if __name__ == "__main__":
    main()
