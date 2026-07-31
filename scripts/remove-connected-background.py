#!/usr/bin/env python3
"""Remove the connected peach backdrop used by the project host pose sheets."""

from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Make border-connected peach pixels transparent."
    )
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--min-r", type=int, default=205)
    parser.add_argument("--min-g", type=int, default=180)
    parser.add_argument("--min-b", type=int, default=155)
    parser.add_argument("--min-rg", type=int, default=5)
    parser.add_argument("--max-rg", type=int, default=55)
    parser.add_argument("--min-gb", type=int, default=0)
    parser.add_argument("--max-gb", type=int, default=55)
    return parser.parse_args()


def connected_border_mask(candidate: np.ndarray) -> np.ndarray:
    height, width = candidate.shape
    connected = np.zeros((height, width), dtype=np.bool_)
    queue: deque[tuple[int, int]] = deque()

    def seed(y: int, x: int) -> None:
        if candidate[y, x] and not connected[y, x]:
            connected[y, x] = True
            queue.append((y, x))

    for x in range(width):
        seed(0, x)
        seed(height - 1, x)
    for y in range(1, height - 1):
        seed(y, 0)
        seed(y, width - 1)

    while queue:
        y, x = queue.popleft()
        if y > 0:
            seed(y - 1, x)
        if y + 1 < height:
            seed(y + 1, x)
        if x > 0:
            seed(y, x - 1)
        if x + 1 < width:
            seed(y, x + 1)

    return connected


def main() -> None:
    args = parse_args()
    rgb = np.asarray(Image.open(args.input).convert("RGB"), dtype=np.uint8)
    values = rgb.astype(np.int16)
    red, green, blue = values[..., 0], values[..., 1], values[..., 2]

    red_green = red - green
    green_blue = green - blue
    candidate = (
        (red >= args.min_r)
        & (green >= args.min_g)
        & (blue >= args.min_b)
        & (red_green >= args.min_rg)
        & (red_green <= args.max_rg)
        & (green_blue >= args.min_gb)
        & (green_blue <= args.max_gb)
    )
    background = connected_border_mask(candidate)

    alpha = np.where(background, 0, 255).astype(np.uint8)
    rgba = np.dstack((rgb, alpha))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgba, "RGBA").save(args.output)

    removed = int(background.sum())
    total = int(background.size)
    print(f"removed={removed}/{total} ({removed / total:.2%}) output={args.output}")


if __name__ == "__main__":
    main()
