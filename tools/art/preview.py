"""Make an enlarged preview PNG from texel JSON files. Usage: preview.py out.png file.json [file.json ...]"""
import json, struct, sys, zlib
out, files = sys.argv[1], sys.argv[2:]
sprites = [json.load(open(f)) for f in files]
k = 8 if max(len(s['pixel_data']) for s in sprites) > 16 else 12
cell = max(len(s['pixel_data']) for s in sprites) * k + 8
W, H = cell * len(sprites), cell
img = [[(40, 40, 40)] * W for _ in range(H)]
for i, s in enumerate(sprites):
    px, pal = s['pixel_data'], s['colors']
    for y in range(len(px) * k):
        for x in range(len(px[0]) * k):
            v = px[y // k][x // k]
            c = ((70, 70, 70) if ((x // 6 + y // 6) % 2) else (95, 95, 95)) if v < 0 else tuple(int(pal[v][j:j + 2], 16) for j in (1, 3, 5))
            img[y + 4][x + 4 + i * cell] = c
raw = b''.join(b'\x00' + bytes(v for p in row for v in (*p, 255)) for row in img)
ch = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
open(out, 'wb').write(b'\x89PNG\r\n\x1a\n' + ch(b'IHDR', struct.pack('>IIBBBBB', W, H, 8, 6, 0, 0, 0)) + ch(b'IDAT', zlib.compress(raw)) + ch(b'IEND', b''))
