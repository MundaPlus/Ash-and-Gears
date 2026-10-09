"""Method B cleanup: crop, shrink by averaging, own 16-color palette, dark outline.
The background is a flood fill from the border, so light parts inside the object (labels) stay.
Usage: clean.py in.png W H out.png [texture]. Env HOLE_DIST / HOLE_AREA = hole color distance and minimum share of the picture, NC = color count (default 15), QM = median|octree|maxcov.
"""
import os
import sys
import numpy as np
from PIL import Image
from scipy import ndimage
src, W, H, out = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
texture = len(sys.argv) > 5 and sys.argv[5] == "texture"
HOLE_DIST = float(os.environ.get("HOLE_DIST", "12")); HOLE_AREA = float(os.environ.get("HOLE_AREA", "0.002"))
NC = int(os.environ.get("NC", "15")); QM = os.environ.get("QM", "median")
im = Image.open(src).convert("RGB"); a = np.array(im, float)
corner = np.array([a[0, 0], a[0, -1], a[-1, 0], a[-1, -1]]).mean(0)

def background(a: np.ndarray) -> np.ndarray:
    """Pixels near the corner color that connect to the image border."""
    lab, _ = ndimage.label(np.linalg.norm(a - corner, axis=2) <= 30)
    edge = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    bg = np.isin(lab, edge[edge > 0])
    # Holes (between table legs): enclosed areas of almost exact background color that are not tiny.
    hole, n = ndimage.label((np.linalg.norm(a - corner, axis=2) <= HOLE_DIST) & ~bg)
    if n:
        sizes = ndimage.sum(np.ones_like(hole), hole, range(1, n + 1))
        bg |= np.isin(hole, 1 + np.flatnonzero(sizes >= HOLE_AREA * hole.size))
    return bg
mask = ~background(a) if not texture else np.ones(a.shape[:2], bool)
ys, xs = np.where(mask); box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
obj = im.crop(box); m = Image.fromarray((mask * 255).astype("uint8")).crop(box)
cw, ch = obj.size
s = max(cw / W, ch / H) if texture else max(cw / (W - 2), ch / (H - 2))
gw, gh = max(1, round(cw / s)), max(1, round(ch / s))
small = obj.resize((gw, gh), Image.BOX); ms = np.array(m.resize((gw, gh), Image.BOX)) > 110
qm = {"median": Image.Quantize.MEDIANCUT, "octree": Image.Quantize.FASTOCTREE, "maxcov": Image.Quantize.MAXCOVERAGE}[QM]
q = small.quantize(colors=NC, method=qm, kmeans=3 if QM == "median" else 0, dither=Image.Dither.NONE).convert("RGB")
canvas = Image.new("RGBA", (W, H)); ox, oy = (0, 0) if texture else ((W - gw) // 2, H - 1 - gh)
qa = np.array(q)
for y in range(gh):
    for x in range(gw):
        if ms[y, x]: canvas.putpixel((ox + x, oy + y), tuple(int(c) for c in qa[y, x]) + (255,))
if not texture:
    c = np.array(canvas); al = c[:, :, 3] > 0; edge = np.zeros_like(al)
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        sh = np.zeros_like(al); sh[max(dy,0):H+min(dy,0), max(dx,0):W+min(dx,0)] = al[max(-dy,0):H+min(-dy,0), max(-dx,0):W+min(-dx,0)]
        edge |= al & ~sh
    c[edge] = [28, 22, 18, 255]; canvas = Image.fromarray(c)
canvas.save(out)
