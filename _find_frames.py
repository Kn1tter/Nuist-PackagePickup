# -*- coding: utf-8 -*-
import struct
import zlib
from pathlib import Path


def paeth(a, b, c):
    p = a + b - c
    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    if pb <= pc:
        return b
    return c


def read_png(path):
    data = Path(path).read_bytes()
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
            plte = [chunk[j : j + 3] for j in range(0, len(chunk), 3)]
        elif typ == b"tRNS":
            trns = list(chunk)
        elif typ == b"IDAT":
            idat.append(chunk)
        elif typ == b"IEND":
            break
    raw = zlib.decompress(b"".join(idat))
    stride = (w * bit + 7) // 8
    rows_idx = []
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
        idxs = []
        for x in range(w):
            byte = row[x // 2]
            idxs.append((byte >> 4) if x % 2 == 0 else (byte & 0x0F))
        rows_idx.append(idxs)
        prev = row
    return w, h, plte, trns, rows_idx


def rgba(plte, trns, idx):
    r, g, b = plte[idx]
    a = 255
    if trns is not None and idx < len(trns):
        a = trns[idx]
    return (r, g, b, a)


def write_png(path, w, h, pixels):
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
            # composite on white so we can see
            r, g, b, a = pixels[y * w + x]
            if a < 128:
                r, g, b = 247, 247, 247
            raw.extend((r, g, b, 255))
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)
    Path(path).write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )


w, h, plte, trns, rows = read_png("frontend/public/dino-sprite.png")


def crop(x0, y0, cw, ch, name):
    if x0 + cw > w or y0 + ch > h:
        print(name, "OOB", x0, y0, cw, ch)
        return
    pix = []
    vis = 0
    for y in range(ch):
        for x in range(cw):
            p = rgba(plte, trns, rows[y0 + y][x0 + x])
            pix.append(p)
            if p[3] > 20:
                vis += 1
    write_png(f"frontend/public/_f_{name}.png", cw, ch, pix)
    print(name, "x", x0, "vis", vis)


# Trex strip: dump every 44px from 677
print("--- strip from 677 ---")
for i, x in enumerate(range(677, 1060, 44)):
    crop(x, 2, 44, 47, f"t{i}_{x}")

# wide 59px candidates for duck near end of trex
print("--- duck candidates 59px ---")
for x in range(900, 1050, 1):
    vis = 0
    for yy in range(2, 49):
        for xx in range(x, min(x + 59, w)):
            if rgba(plte, trns, rows[yy][xx])[3] > 20:
                vis += 1
    if vis > 700:
        print("wide dense", x, vis)

# also check 2x sprite
p2 = Path("frontend/public/dino-sprite-2x.png")
print("2x size", p2.stat().st_size)
b = p2.read_bytes()
print("2x IHDR", struct.unpack(">IIBB", b[16:26]))
