# -*- coding: utf-8 -*-
"""Download a known-good dino sprite and convert to RGBA with solid outline."""
import struct
import zlib
import urllib.request
from pathlib import Path

URLS = [
    "https://cdn.jsdelivr.net/gh/wayou/t-rex-runner@gh-pages/assets/offline-sprite-1x.png",
    "https://raw.githubusercontent.com/wayou/t-rex-runner/gh-pages/assets/offline-sprite-1x.png",
    "https://trex-runner.com/offline-sprite.png",
]


def paeth(a, b, c):
    p = a + b - c
    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    if pb <= pc:
        return b
    return c


def read_png(data: bytes):
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    i = 8
    w = h = bit = ct = None
    plte = trns = None
    idat = []
    while i < len(data):
        ln = struct.unpack(">I", data[i : i + 4])[0]
        typ = data[i + 4 : i + 8]
        chunk = data[i + 8 : i + 8 + ln]
        i += 12 + ln
        if typ == b"IHDR":
            w, h, bit, ct = struct.unpack(">IIBB", chunk[:10])
        elif typ == b"PLTE":
            plte = [tuple(chunk[j : j + 3]) for j in range(0, len(chunk), 3)]
        elif typ == b"tRNS":
            trns = list(chunk)
        elif typ == b"IDAT":
            idat.append(chunk)
        elif typ == b"IEND":
            break
    raw = zlib.decompress(b"".join(idat))
    return w, h, bit, ct, plte, trns, raw


def decode_indexed_4(w, h, raw, plte, trns):
    stride = (w * 4 + 7) // 8
    rows = []
    prev = bytearray(stride)
    p = 0
    for _y in range(h):
        f = raw[p]
        p += 1
        row = bytearray(raw[p : p + stride])
        p += stride
        if f == 1:
            for x in range(1, stride):
                row[x] = (row[x] + row[x - 1]) & 255
        elif f == 2:
            for x in range(stride):
                row[x] = (row[x] + prev[x]) & 255
        elif f == 3:
            for x in range(stride):
                left = row[x - 1] if x else 0
                row[x] = (row[x] + ((left + prev[x]) // 2)) & 255
        elif f == 4:
            for x in range(stride):
                a = row[x - 1] if x else 0
                b = prev[x]
                c = prev[x - 1] if x else 0
                row[x] = (row[x] + paeth(a, b, c)) & 255
        pix = []
        for x in range(w):
            idx = (row[x // 2] >> 4) if x % 2 == 0 else (row[x // 2] & 0x0F)
            r, g, b = plte[idx]
            a = trns[idx] if trns is not None and idx < len(trns) else 255
            # remap light outline (#f7f7f7 / white) to darker so visible on white bg
            if a > 0 and r >= 0xF0:
                r = g = b = 0x53
            elif a > 0 and r >= 0xD0:
                r = g = b = 0x53
            pix.append((r, g, b, a))
        rows.append(pix)
        prev = row
    return rows


def write_rgba(path, rows):
    h = len(rows)
    w = len(rows[0])

    def chunk(tag, data):
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    raw = bytearray()
    for y in range(h):
        raw.append(0)
        for x in range(w):
            raw.extend(rows[y][x])
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)
    Path(path).write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )
    # count opaque in trex zone
    opaque = 0
    for y in range(2, min(49, h)):
        for x in range(848, min(1200, w)):
            if rows[y][x][3] > 20:
                opaque += 1
    print("wrote", path, w, h, "trex-zone-opaque", opaque)


# fetch
data = None
for u in URLS:
    try:
        print("try", u)
        with urllib.request.urlopen(u, timeout=60) as r:
            data = r.read()
        print("got", len(data))
        break
    except Exception as e:
        print("fail", e)

if not data:
    data = Path("frontend/public/dino-sprite.png").read_bytes()
    print("using local", len(data))

w, h, bit, ct, plte, trns, raw = read_png(data)
print("IHDR", w, h, bit, ct, "plte", plte, "trns", trns)
assert ct == 3 and bit == 4
rows = decode_indexed_4(w, h, raw, plte, trns)

# verify duck frame area
for label, x0, cw in [("stand", 848, 44), ("run1", 848 + 88, 44), ("duck1", 848 + 264, 59), ("duck2", 848 + 323, 59)]:
    vis = sum(1 for y in range(2, 49) for x in range(x0, min(x0 + cw, w)) if rows[y][x][3] > 20)
    print(label, "x", x0, "vis", vis)

out = Path("frontend/public/dino-sprite.png")
write_rgba(out, rows)
# also copy as 1x only game asset
print("done", out.stat().st_size)
