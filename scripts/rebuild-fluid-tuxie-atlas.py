#!/usr/bin/env python3
"""Build an app-specific Tuxie atlas with fluid 8-frame action rows."""

from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path

from PIL import Image, ImageDraw

CELL_WIDTH = 192
CELL_HEIGHT = 208
COLUMNS = 8
ROWS = 9
ATLAS_WIDTH = CELL_WIDTH * COLUMNS
ATLAS_HEIGHT = CELL_HEIGHT * ROWS
CHROMA_KEY = (0, 255, 255)
CHROMA_THRESHOLD = 48

ROW_LABELS = [
    ("idle", 0, 6),
    ("running-right", 1, 8),
    ("running-left", 2, 8),
    ("play-wand", 3, 8),
    ("play-ball", 4, 8),
    ("sleeping", 5, 8),
    ("eating", 6, 8),
    ("running", 7, 6),
    ("thinking", 8, 6),
]


def load_extract_module():
    script = (
        Path.home()
        / ".codex"
        / "skills"
        / "hatch-pet"
        / "scripts"
        / "extract_strip_frames.py"
    )
    spec = importlib.util.spec_from_file_location("extract_strip_frames", script)
    if spec is None or spec.loader is None:
        raise SystemExit(f"Unable to load {script}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def extract_frames(source: Path, frame_count: int, output_dir: Path) -> list[Path]:
    extract = load_extract_module()
    output_dir.mkdir(parents=True, exist_ok=True)

    with Image.open(source) as opened:
        strip = extract.remove_chroma_background(opened, CHROMA_KEY, CHROMA_THRESHOLD)

    frames = extract.extract_component_frames(strip, frame_count)
    method = "components"
    if frames is None:
        frames = extract.extract_slot_frames(strip, frame_count)
        method = "slots"

    outputs = []
    for index, frame in enumerate(frames):
        target = output_dir / f"{index:02d}.png"
        frame.save(target)
        outputs.append(target)

    return outputs, method


def clear_row(atlas: Image.Image, row: int) -> None:
    transparent = Image.new("RGBA", (ATLAS_WIDTH, CELL_HEIGHT), (0, 0, 0, 0))
    atlas.alpha_composite(transparent, (0, row * CELL_HEIGHT))
    atlas.paste(transparent, (0, row * CELL_HEIGHT))


def paste_frame(atlas: Image.Image, frame_path: Path, row: int, column: int) -> None:
    with Image.open(frame_path) as opened:
        frame = opened.convert("RGBA")
    if frame.size != (CELL_WIDTH, CELL_HEIGHT):
        frame.thumbnail((CELL_WIDTH, CELL_HEIGHT), Image.Resampling.LANCZOS)
    left = column * CELL_WIDTH + (CELL_WIDTH - frame.width) // 2
    top = row * CELL_HEIGHT + (CELL_HEIGHT - frame.height) // 2
    atlas.alpha_composite(frame, (left, top))


def nonempty_cells(atlas: Image.Image) -> dict[str, list[int]]:
    result = {}
    alpha = atlas.getchannel("A")
    for label, row, _frames in ROW_LABELS:
        used = []
        for column in range(COLUMNS):
            left = column * CELL_WIDTH
            top = row * CELL_HEIGHT
            cell = alpha.crop((left, top, left + CELL_WIDTH, top + CELL_HEIGHT))
            if cell.getbbox() is not None:
                used.append(column)
        result[label] = used
    return result


def make_contact_sheet(atlas: Image.Image, output: Path) -> None:
    label_width = 152
    row_height = CELL_HEIGHT + 28
    sheet = Image.new("RGBA", (label_width + ATLAS_WIDTH, row_height * ROWS), (20, 20, 22, 255))
    draw = ImageDraw.Draw(sheet)
    alpha_bg_a = (238, 238, 238, 255)
    alpha_bg_b = (216, 216, 216, 255)
    tile = 16

    for label, row, frames in ROW_LABELS:
        y = row * row_height
        draw.text((10, y + 8), f"row {row}: {label}", fill=(245, 245, 245, 255))
        draw.text((10, y + 24), f"{frames} frames", fill=(180, 180, 180, 255))
        for column in range(COLUMNS):
            x = label_width + column * CELL_WIDTH
            for yy in range(0, CELL_HEIGHT, tile):
                for xx in range(0, CELL_WIDTH, tile):
                    color = alpha_bg_a if ((xx // tile) + (yy // tile)) % 2 == 0 else alpha_bg_b
                    draw.rectangle((x + xx, y + 28 + yy, x + xx + tile - 1, y + 28 + yy + tile - 1), fill=color)
            cell = atlas.crop(
                (
                    column * CELL_WIDTH,
                    row * CELL_HEIGHT,
                    (column + 1) * CELL_WIDTH,
                    (row + 1) * CELL_HEIGHT,
                )
            )
            sheet.alpha_composite(cell, (x, y + 28))
            outline = (36, 160, 96, 255) if column < frames else (170, 50, 58, 255)
            draw.rectangle((x, y + 28, x + CELL_WIDTH - 1, y + 28 + CELL_HEIGHT - 1), outline=outline, width=2)
            draw.text((x + 5, y + 32), str(column), fill=(0, 0, 0, 255))

    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-atlas", required=True)
    parser.add_argument("--play-wand")
    parser.add_argument("--play-ball")
    parser.add_argument("--eating")
    parser.add_argument("--sleeping")
    parser.add_argument("--output-png", required=True)
    parser.add_argument("--output-webp", required=True)
    parser.add_argument("--frames-root", required=True)
    parser.add_argument("--contact-sheet", required=True)
    parser.add_argument("--summary", required=True)
    args = parser.parse_args()

    with Image.open(Path(args.base_atlas).expanduser()) as opened:
        atlas = opened.convert("RGBA")
    if atlas.size != (ATLAS_WIDTH, ATLAS_HEIGHT):
        raise SystemExit(f"base atlas must be {ATLAS_WIDTH}x{ATLAS_HEIGHT}; got {atlas.size}")

    replacements = []
    if args.play_wand:
        replacements.append(("play-wand", 3, Path(args.play_wand).expanduser().resolve()))
    if args.play_ball:
        replacements.append(("play-ball", 4, Path(args.play_ball).expanduser().resolve()))
    if args.sleeping:
        replacements.append(("sleeping", 5, Path(args.sleeping).expanduser().resolve()))
    if args.eating:
        replacements.append(("eating", 6, Path(args.eating).expanduser().resolve()))
    if not replacements:
        raise SystemExit("at least one replacement row source is required")

    frames_root = Path(args.frames_root).expanduser().resolve()
    methods = {}
    for label, row, source in replacements:
        frames, method = extract_frames(source, 8, frames_root / label)
        methods[label] = method
        clear_row(atlas, row)
        for column, frame_path in enumerate(frames):
            paste_frame(atlas, frame_path, row, column)

    output_png = Path(args.output_png).expanduser().resolve()
    output_webp = Path(args.output_webp).expanduser().resolve()
    output_png.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(output_png)
    atlas.save(output_webp, format="WEBP", lossless=True, quality=100, method=6)

    contact_sheet = Path(args.contact_sheet).expanduser().resolve()
    make_contact_sheet(atlas, contact_sheet)

    summary = {
        "ok": True,
        "atlas": {
            "width": atlas.width,
            "height": atlas.height,
            "mode": atlas.mode,
        },
        "replaced_rows": [{"label": label, "row": row, "source": str(source)} for label, row, source in replacements],
        "extraction_methods": methods,
        "nonempty_cells": nonempty_cells(atlas),
        "outputs": {
            "png": str(output_png),
            "webp": str(output_webp),
            "contact_sheet": str(contact_sheet),
        },
    }
    summary_path = Path(args.summary).expanduser().resolve()
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
