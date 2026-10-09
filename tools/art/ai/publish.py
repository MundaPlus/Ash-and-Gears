"""Copy the chosen AI tries (picks.json) into the client as packages/client/src/assets/ai/<id>.<k>.png.
k counts from 0 in the order of the picks list. Old files in that folder are removed first.
Usage: python tools/art/ai/publish.py
"""
import glob, json, os, shutil

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "../../.."))
DEST = os.path.join(ROOT, "packages/client/src/assets/ai")
picks = {k: v for k, v in json.load(open(os.path.join(HERE, "picks.json"))).items() if not k.startswith("_")}
os.makedirs(DEST, exist_ok=True)
for old in glob.glob(os.path.join(DEST, "*.png")):
    os.remove(old)
for sid, pick in picks.items():
    for k, n in enumerate(pick if isinstance(pick, list) else [pick]):
        shutil.copy(os.path.join(ROOT, "art/ai", sid, f"{n}.png"), os.path.join(DEST, f"{sid}.{k}.png"))
        print(f"{sid}.{k}.png <- art/ai/{sid}/{n}.png")
