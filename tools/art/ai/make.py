"""
AI sprites for Ash & Gears: ComfyUI (superPixelartXL) draws each try, clean.py shrinks it to game size
with its own 16 colors (method B), and a pick page shows all tries side by side.
Usage: uv run --with pillow --with numpy python tools/art/ai/make.py [--only id,id] [--server URL]
Output: art/ai/<id>/raw_<n>.png, art/ai/<id>/<n>.png and art/ai/pick.html. Existing tries are kept.
"""
import argparse, base64, io, json, os, subprocess, sys, time, urllib.parse, urllib.request
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "../../.."))
OUT = os.path.join(ROOT, "art/ai")
ap = argparse.ArgumentParser()
ap.add_argument("--server", default="http://192.168.31.205:8188")
ap.add_argument("--only", default="")
ap.add_argument("--ckpt", default="superPixelartXLMV20_superPixelartXLMV20.safetensors")
args = ap.parse_args()
spec = json.load(open(os.path.join(HERE, "sprites.json")))
NEG = "blurry, smooth shading, gradient, photo, 3d render, text, watermark, perspective, multiple objects"

def draw(prompt: str, neg: str, w: int, h: int, seed: int, dest: str) -> None:
    """One picture on ComfyUI, saved to dest."""
    wf = {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": args.ckpt}},
        "2": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["1", 1], "text": prompt}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["1", 1], "text": neg}},
        "4": {"class_type": "EmptyLatentImage", "inputs": {"width": w, "height": h, "batch_size": 1}},
        "5": {"class_type": "KSampler", "inputs": {"model": ["1", 0], "seed": seed, "steps": 28, "cfg": 6.5, "sampler_name": "dpmpp_2m", "scheduler": "karras", "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["4", 0], "denoise": 1}},
        "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
        "7": {"class_type": "SaveImage", "inputs": {"images": ["6", 0], "filename_prefix": "ashgears/sprite"}},
    }
    req = urllib.request.Request(args.server + "/prompt", data=json.dumps({"prompt": wf}).encode(), headers={"content-type": "application/json"})
    pid = json.load(urllib.request.urlopen(req))["prompt_id"]
    t0 = time.time()
    while time.time() - t0 < 900:
        time.sleep(3)
        h_ = json.load(urllib.request.urlopen(f"{args.server}/history/{pid}")).get(pid)
        if not h_:
            continue
        if h_.get("status", {}).get("status_str") == "error":
            raise RuntimeError(json.dumps(h_["status"])[:400])
        imgs = [i for o in h_.get("outputs", {}).values() for i in o.get("images", [])]
        if imgs:
            q = urllib.parse.urlencode({k: imgs[0][k] for k in ("filename", "subfolder", "type")})
            open(dest, "wb").write(urllib.request.urlopen(f"{args.server}/view?{q}").read())
            return
    raise TimeoutError(dest)

def uri(im: Image.Image, fmt: str = "PNG") -> str:
    b = io.BytesIO()
    im.save(b, fmt, **({"quality": 78} if fmt == "JPEG" else {}))
    return f"data:image/{fmt.lower()};base64," + base64.b64encode(b.getvalue()).decode()

only = [x for x in args.only.split(",") if x]
for sid, s in spec["sprites"].items():
    if only and sid not in only:
        continue
    d = os.path.join(OUT, sid)
    os.makedirs(d, exist_ok=True)
    w, h = s["size"]
    # The picture has the sprite's shape: 1024 on the long side.
    pw, ph = (1024, 1024 * h // w) if w >= h else (1024 * w // h, 1024)
    for n in range(1, s["tries"] + 1):
        raw, small = os.path.join(d, f"raw_{n}.png"), os.path.join(d, f"{n}.png")
        if not os.path.exists(raw):
            draw(f'{spec["style"]}, {s["prompt"]}', f'{s.get("neg", "")}, {NEG}', pw, ph, n * 13 + 5, raw)
            print("drew", sid, n, flush=True)
        if not os.path.exists(small):
            subprocess.run([sys.executable, os.path.join(HERE, "clean.py"), raw, str(w), str(h), small] + (["texture"] if s.get("texture") else []), check=True)

# Pick page: every try of every sprite at 4x, with the raw picture under it.
cards = []
for sid, s in spec["sprites"].items():
    d = os.path.join(OUT, sid)
    figs = []
    for n in range(1, s["tries"] + 1):
        small = os.path.join(d, f"{n}.png")
        if not os.path.exists(small):
            continue
        im = Image.open(small)
        k = max(1, 128 // max(im.size))
        raw = Image.open(os.path.join(d, f"raw_{n}.png")).convert("RGB")
        raw.thumbnail((96, 96))
        figs.append(f'<figure><img class="px" src="{uri(im.resize((im.size[0] * k, im.size[1] * k), Image.NEAREST))}" alt="{sid} try {n}"><img class="raw" src="{uri(raw, "JPEG")}" alt="raw {n}"><figcaption>{sid} {n}</figcaption></figure>')
    cards.append(f'<section><h2>{sid} <small>{s["size"][0]}×{s["size"][1]}</small></h2><div class="row">{"".join(figs)}</div></section>')
page = f"""<title>Ash &amp; Gears Sprite Picks</title><style>
:root{{--bg:#1d1916;--panel:#28221d;--fg:#ece2d0;--muted:#b3a58f;color-scheme:dark}}
body{{background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif;padding:16px}}
section{{background:var(--panel);padding:12px;margin-bottom:14px}} h2{{margin:0 0 8px;font-size:18px}} small{{color:var(--muted)}}
.row{{display:flex;flex-wrap:wrap;gap:14px}} figure{{margin:0;display:grid;gap:4px;justify-items:start}}
figcaption{{color:var(--muted);font-size:12px}} img.px{{image-rendering:pixelated;background:#342c25}} img.raw{{width:72px}}
</style><h1>Sprite picks</h1>{"".join(cards)}"""
open(os.path.join(OUT, "pick.html"), "w").write(page)
print("pick page:", os.path.join(OUT, "pick.html"))
