"""Bake the desk's outdoor silhouette into an alpha PNG for Safari CSS masking."""

import argparse
import struct
import zlib
from pathlib import Path


def read_rgb_png(path):
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("Expected a PNG image")
    offset = 8
    compressed = bytearray()
    dimensions = None
    while offset < len(data):
        length = struct.unpack_from(">I", data, offset)[0]
        kind = data[offset + 4:offset + 8]
        payload = data[offset + 8:offset + 8 + length]
        if kind == b"IHDR":
            width, height, depth, color, compression, filtering, interlace = struct.unpack(">IIBBBBB", payload)
            if (depth, color, compression, filtering, interlace) != (8, 2, 0, 0, 0):
                raise ValueError("Expected a non-interlaced, 8-bit RGB PNG")
            dimensions = width, height
        elif kind == b"IDAT":
            compressed.extend(payload)
        offset += length + 12
    if dimensions is None:
        raise ValueError("PNG has no dimensions")
    width, height = dimensions
    raw = zlib.decompress(compressed)
    stride = width * 3
    if len(raw) != height * (stride + 1):
        raise ValueError("Unexpected PNG data length")
    rows = []
    previous = bytearray(stride)
    for y in range(height):
        start = y * (stride + 1)
        filtering = raw[start]
        row = bytearray(raw[start + 1:start + 1 + stride])
        if filtering not in range(5):
            raise ValueError("Unknown PNG scanline filter")
        for x in range(stride):
            left = row[x - 3] if x >= 3 else 0
            above = previous[x]
            diagonal = previous[x - 3] if x >= 3 else 0
            estimate = left + above - diagonal
            distances = (abs(estimate - left), abs(estimate - above), abs(estimate - diagonal))
            paeth = (left, above, diagonal)[distances.index(min(distances))]
            predictor = (0, left, above, (left + above) // 2, paeth)[filtering]
            row[x] = (row[x] + predictor) & 255
        rows.append(row)
        previous = row
    return width, height, rows


def sky_alpha(width, height, rows):
    sky_width, sky_height = min(120, width), min(275, height)
    sky = []
    for y, row in enumerate(rows[:sky_height]):
        visible = []
        for x in range(sky_width):
            red, green, blue = row[x * 3:x * 3 + 3]
            bright_sky = .2126 * red + .7152 * green + .0722 * blue >= .7 * 255
            # Only the tower's base overlaps leaves; distinguish its neutral shadows there.
            tower = x >= 100 and y >= 100 and (
                y < 260 or (blue >= 45 and blue >= .65 * green)
            )
            visible.append(bright_sky or tower)
        sky.append(visible)
    alpha = bytearray(width * height)
    for y in range(1, sky_height - 1):
        for x in range(1, sky_width - 1):
            if all(sky[dy][dx] for dy in range(y - 1, y + 2) for dx in range(x - 1, x + 2)):
                alpha[y * width + x] = 255
    return alpha


def alpha_png(width, height, alpha):
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

    scanlines = bytearray()
    for y in range(height):
        scanlines.append(0)
        for value in alpha[y * width:(y + 1) * width]:
            scanlines.extend((255, value))
    header = struct.pack(">IIBBBBB", width, height, 8, 4, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(scanlines, 9)) + chunk(b"IEND", b"")


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=root / "assets/desk.png")
    parser.add_argument("--output", type=Path, default=root / "assets/weather-glass-mask.png")
    args = parser.parse_args()
    width, height, rows = read_rgb_png(args.source)
    args.output.write_bytes(alpha_png(width, height, sky_alpha(width, height, rows)))
