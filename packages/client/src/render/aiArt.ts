/**
 * AI-drawn sprites at 32 px per tile (tools/art/ai, copied in by publish.py as <id>.<k>.png).
 * The "32" art size uses them for things; "hybrid" and "32" use them for items and characters.
 * The art is drawn in rust colors. Other palettes shift each pixel by the change of its nearest
 * rust color, so the AI detail stays and the mood follows the palette.
 */
import { Texture } from "pixi.js";
import { PALETTES } from "@wc/data";

const URLS = import.meta.glob("../assets/ai/*.png", { eager: true, query: "?url", import: "default" }) as Record<string, string>;

/** Sprite id → its looks (index k of <id>.<k>.png). */
export type AiArt = Map<string, HTMLCanvasElement[]>;

/** Decode all AI sprites. A sprite that fails to load is left out (the hand-made art draws instead). */
export async function loadAiArt(): Promise<AiArt> {
  const out: AiArt = new Map();
  await Promise.all(
    Object.entries(URLS).map(async ([path, url]) => {
      const m = /\/([a-z0-9_]+)\.(\d+)\.png$/.exec(path);
      if (!m) return;
      const img = new Image();
      img.src = url;
      try {
        await img.decode();
      } catch {
        return;
      }
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      c.getContext("2d")!.drawImage(img, 0, 0);
      const list = out.get(m[1]) ?? [];
      list[Number(m[2])] = c;
      out.set(m[1], list);
    }),
  );
  for (const [id, list] of out) out.set(id, list.filter(Boolean));
  return out;
}

const rgb = (hex: string) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

/** A texture from an AI sprite in the given palette, turned 90 degrees clockwise if asked. */
export function aiTexture(src: HTMLCanvasElement, palette: string, turn = false): Texture {
  const c = document.createElement("canvas");
  c.width = turn ? src.height : src.width;
  c.height = turn ? src.width : src.height;
  const g = c.getContext("2d")!;
  if (turn) {
    g.translate(c.width, 0);
    g.rotate(Math.PI / 2);
  }
  g.drawImage(src, 0, 0);
  g.setTransform(1, 0, 0, 1, 0, 0);
  if (palette !== "rust" && PALETTES[palette]) grade(g, c.width, c.height, palette);
  const t = Texture.from(c);
  t.source.scaleMode = "nearest";
  return t;
}

function grade(g: CanvasRenderingContext2D, w: number, h: number, palette: string) {
  const base = PALETTES.rust.map(rgb);
  const to = PALETTES[palette].map(rgb);
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const near = new Map<number, number>();
  for (let o = 0; o < d.length; o += 4) {
    if (!d[o + 3]) continue;
    const key = (d[o] << 16) | (d[o + 1] << 8) | d[o + 2];
    let k = near.get(key);
    if (k === undefined) {
      let best = Infinity;
      k = 0;
      for (let i = 0; i < base.length; i++) {
        const e = (base[i][0] - d[o]) ** 2 + (base[i][1] - d[o + 1]) ** 2 + (base[i][2] - d[o + 2]) ** 2;
        if (e < best) [best, k] = [e, i];
      }
      near.set(key, k);
    }
    for (let ch = 0; ch < 3; ch++) d[o + ch] = Math.max(0, Math.min(255, d[o + ch] + to[k][ch] - base[k][ch]));
  }
  g.putImageData(img, 0, 0);
}
