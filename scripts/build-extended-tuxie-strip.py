#!/usr/bin/env python3
"""Extract a generated 16-frame Tuxie action strip into an app-ready WebP strip."""

from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path

from PIL import Image, ImageDraw

CELL_WIDTH = 192
CELL_HEIGHT = 208
CHROMA_KEY = (0, 255, 255)


def load_extract_module():
    script = Path.home() / ".codex" / "skills" / "hatch-pet" / "scripts" / "extract_strip_frames.py"
    spec = importlib.util.spec_from_file_location("extract_strip_frames", script)
    if spec is None or spec.loader is None:
        raise SystemExit(f"Unable to load {script}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def extract_column_frames(strip: Image.Image, frame_count: int) -> list[Image.Image] | None:
    alpha = strip.getchannel("A")
    column_counts = []
    for x in range(strip.width):
        column = alpha.crop((x, 0, x + 1, strip.height))
        column_counts.append(sum(1 for value in column.tobytes() if value > 16))

    occupied = [count > 6 for count in column_counts]
    max_gap = max(8, round(strip.width / frame_count * 0.06))
    index = 0
    while index < len(occupied):
        if occupied[index]:
            index += 1
            continue
        gap_start = index
        while index < len(occupied) and not occupied[index]:
            index += 1
        gap_end = index
        if gap_start > 0 and gap_end < len(occupied) and gap_end - gap_start <= max_gap:
            for fill_index in range(gap_start, gap_end):
                occupied[fill_index] = True

    ranges: list[tuple[int, int]] = []
    index = 0
    while index < len(occupied):
        if not occupied[index]:
            index += 1
            continue
        start = index
        while index < len(occupied) and occupied[index]:
            index += 1
        end = index
        if end - start >= 12:
            ranges.append((start, end))

    while len(ranges) > frame_count:
        merge_index = min(
            range(len(ranges) - 1),
            key=lambda item: ranges[item + 1][0] - ranges[item][1],
        )
        ranges[merge_index] = (ranges[merge_index][0], ranges[merge_index + 1][1])
        del ranges[merge_index + 1]

    if len(ranges) != frame_count:
        return None

    extract = load_extract_module()
    frames = []
    padding = max(4, round(strip.width / frame_count * 0.04))
    for start, end in ranges:
        left = max(0, start - padding)
        right = min(strip.width, end + padding)
        frames.append(extract.fit_to_cell(strip.crop((left, 0, right, strip.height))))
    return frames


def extract_grid_frames(strip: Image.Image, frame_count: int, source_grid: str) -> list[Image.Image]:
    try:
        raw_rows, raw_columns = source_grid.lower().split("x", 1)
        grid_rows = int(raw_rows)
        grid_columns = int(raw_columns)
    except ValueError as exc:
        raise SystemExit("--source-grid must use ROWSxCOLUMNS, for example 2x8") from exc

    if grid_rows * grid_columns != frame_count:
        raise SystemExit(f"--source-grid {source_grid} does not match {frame_count} frames")

    extract = load_extract_module()
    frames = []
    slot_width = strip.width / grid_columns
    slot_height = strip.height / grid_rows
    for row in range(grid_rows):
        for column in range(grid_columns):
            left = round(column * slot_width)
            right = round((column + 1) * slot_width)
            top = round(row * slot_height)
            bottom = round((row + 1) * slot_height)
            frames.append(extract.fit_to_cell(strip.crop((left, top, right, bottom))))
    return frames


def edge_alpha_counts(frame: Image.Image, inset: int = 4) -> dict[str, int]:
    alpha = frame.getchannel("A")
    width, height = frame.size
    return {
        "left": sum(1 for value in alpha.crop((0, 0, inset, height)).tobytes() if value > 16),
        "right": sum(1 for value in alpha.crop((width - inset, 0, width, height)).tobytes() if value > 16),
        "top": sum(1 for value in alpha.crop((0, 0, width, inset)).tobytes() if value > 16),
        "bottom": sum(1 for value in alpha.crop((0, height - inset, width, height)).tobytes() if value > 16),
    }


def extract_frames(
    source: Path,
    frame_count: int,
    method: str,
    threshold: float,
    source_grid: str | None,
) -> tuple[list[Image.Image], str]:
    extract = load_extract_module()
    with Image.open(source) as opened:
        strip = extract.remove_chroma_background(opened, CHROMA_KEY, threshold)

    frames = None
    used_method = method
    if source_grid:
        frames = extract_grid_frames(strip, frame_count, source_grid)
        used_method = f"grid:{source_grid}"
    elif method in {"auto", "columns"}:
        frames = extract_column_frames(strip, frame_count)
        if frames is None and method == "columns":
            raise SystemExit(f"Could not find {frame_count} column-separated frames in {source}")
        if frames is not None:
            used_method = "columns"

    if frames is None and method in {"auto", "components"}:
        frames = extract.extract_component_frames(strip, frame_count)
        if frames is None and method == "components":
            raise SystemExit(f"Could not find {frame_count} sprite components in {source}")
        if frames is not None:
            used_method = "components"

    if frames is None:
        frames = extract.extract_slot_frames(strip, frame_count)
        used_method = "slots"

    if len(frames) != frame_count:
        raise SystemExit(f"Expected {frame_count} frames, extracted {len(frames)}")
    return frames, used_method


def save_frames(frames: list[Image.Image], output_dir: Path) -> list[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    outputs = []
    for index, frame in enumerate(frames):
        target = output_dir / f"{index:02d}.png"
        frame.save(target)
        outputs.append(target)
    return outputs


def clamp_frame_bbox(frame: Image.Image, max_width: int | None, max_height: int | None) -> Image.Image:
    bbox = frame.getbbox()
    if bbox is None:
        return frame

    sprite = frame.crop(bbox)
    scale = 1.0
    if max_width and sprite.width > max_width:
        scale = min(scale, max_width / sprite.width)
    if max_height and sprite.height > max_height:
        scale = min(scale, max_height / sprite.height)
    if scale >= 1.0:
        return frame

    resized = sprite.resize(
        (max(1, round(sprite.width * scale)), max(1, round(sprite.height * scale))),
        Image.Resampling.LANCZOS,
    )
    output = Image.new("RGBA", (CELL_WIDTH, CELL_HEIGHT), (0, 0, 0, 0))
    output.alpha_composite(resized, ((CELL_WIDTH - resized.width) // 2, (CELL_HEIGHT - resized.height) // 2))
    return output


def clamp_frames(frames: list[Image.Image], max_width: int | None, max_height: int | None) -> list[Image.Image]:
    if not max_width and not max_height:
        return frames
    return [clamp_frame_bbox(frame, max_width, max_height) for frame in frames]


def compose_strip(frames: list[Image.Image]) -> Image.Image:
    strip = Image.new("RGBA", (CELL_WIDTH * len(frames), CELL_HEIGHT), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        if frame.size != (CELL_WIDTH, CELL_HEIGHT):
            cell = Image.new("RGBA", (CELL_WIDTH, CELL_HEIGHT), (0, 0, 0, 0))
            frame.thumbnail((CELL_WIDTH, CELL_HEIGHT), Image.Resampling.LANCZOS)
            cell.alpha_composite(frame, ((CELL_WIDTH - frame.width) // 2, (CELL_HEIGHT - frame.height) // 2))
            frame = cell
        strip.alpha_composite(frame, (index * CELL_WIDTH, 0))
    return strip


def make_contact_sheet(frames: list[Image.Image], label: str, output: Path) -> None:
    label_height = 30
    width = CELL_WIDTH * len(frames)
    sheet = Image.new("RGBA", (width, CELL_HEIGHT + label_height), (20, 20, 22, 255))
    draw = ImageDraw.Draw(sheet)
    tile = 16
    for index, frame in enumerate(frames):
        left = index * CELL_WIDTH
        for y in range(0, CELL_HEIGHT, tile):
            for x in range(0, CELL_WIDTH, tile):
                color = (238, 238, 238, 255) if ((x // tile) + (y // tile)) % 2 == 0 else (216, 216, 216, 255)
                draw.rectangle((left + x, label_height + y, left + x + tile - 1, label_height + y + tile - 1), fill=color)
        sheet.alpha_composite(frame, (left, label_height))
        draw.rectangle((left, label_height, left + CELL_WIDTH - 1, label_height + CELL_HEIGHT - 1), outline=(36, 160, 96, 255), width=2)
        draw.text((left + 6, 8), f"{label} {index:02d}", fill=(245, 245, 245, 255))
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output)


def frame_metrics(frames: list[Image.Image]) -> list[dict[str, object]]:
    metrics = []
    for index, frame in enumerate(frames):
        alpha = frame.getchannel("A")
        bbox = alpha.getbbox()
        metrics.append(
            {
                "index": index,
                "bbox": bbox,
                "bbox_width": 0 if bbox is None else bbox[2] - bbox[0],
                "bbox_height": 0 if bbox is None else bbox[3] - bbox[1],
                "alpha_pixels": sum(1 for value in alpha.tobytes() if value > 16),
                "edge_alpha": edge_alpha_counts(frame),
            }
        )
    return metrics


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True)
    parser.add_argument("--label", required=True)
    parser.add_argument("--frames", type=int, default=16)
    parser.add_argument("--method", choices=("auto", "columns", "components", "slots"), default="columns")
    parser.add_argument("--source-grid", help="Optional source layout as ROWSxCOLUMNS, for example 2x8.")
    parser.add_argument("--key-threshold", type=float, default=64.0)
    parser.add_argument("--frames-dir", required=True)
    parser.add_argument("--max-bbox-width", type=int)
    parser.add_argument("--max-bbox-height", type=int)
    parser.add_argument("--output-png", required=True)
    parser.add_argument("--output-webp", required=True)
    parser.add_argument("--contact-sheet", required=True)
    parser.add_argument("--summary", required=True)
    args = parser.parse_args()

    source = Path(args.source).expanduser().resolve()
    frames, method = extract_frames(source, args.frames, args.method, args.key_threshold, args.source_grid)
    frames = clamp_frames(frames, args.max_bbox_width, args.max_bbox_height)
    frame_paths = save_frames(frames, Path(args.frames_dir).expanduser().resolve())
    strip = compose_strip(frames)

    output_png = Path(args.output_png).expanduser().resolve()
    output_webp = Path(args.output_webp).expanduser().resolve()
    output_png.parent.mkdir(parents=True, exist_ok=True)
    strip.save(output_png)
    strip.save(output_webp, format="WEBP", lossless=True, quality=100, method=6)

    contact_sheet = Path(args.contact_sheet).expanduser().resolve()
    make_contact_sheet(frames, args.label, contact_sheet)

    metrics = frame_metrics(frames)
    empty = [item["index"] for item in metrics if not item["bbox"]]
    summary = {
        "ok": not empty,
        "label": args.label,
        "source": str(source),
        "frames": args.frames,
        "method": method,
        "chroma_key": {"rgb": list(CHROMA_KEY), "threshold": args.key_threshold},
        "empty_frames": empty,
        "outputs": {
            "frames": [str(path) for path in frame_paths],
            "png": str(output_png),
            "webp": str(output_webp),
            "contact_sheet": str(contact_sheet),
        },
        "metrics": metrics,
    }
    summary_path = Path(args.summary).expanduser().resolve()
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))

    if empty:
        raise SystemExit(f"Empty extracted frame(s): {empty}")


if __name__ == "__main__":
    main()
