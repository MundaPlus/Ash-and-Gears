/**
 * Placeholder art. Makes a small texture per terrain and thing from its def color,
 * so the game runs before the texel-studio sprites exist. Real sprites replace these by id.
 */
import { Texture } from "pixi.js";
import type { Registry } from "@wc/sim";

export const TILE = 32;

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

/** Tiny deterministic hash for speckle patterns. */
function hash(x: number, y: number, s: number): number {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function canvas(size = TILE): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return [c, c.getContext("2d")!];
}

function toTexture(c: HTMLCanvasElement): Texture {
  const t = Texture.from(c);
  t.source.scaleMode = "nearest";
  return t;
}

export interface TextureSet {
  terrain: Texture[];
  things: Texture[];
  items: Texture[];
  floors: Texture[];
  /** Order markers by Desig code (index 0 unused). */
  desig: Texture[];
  pawn: Texture;
  shadow: Texture;
}

export function makePlaceholderTextures(reg: Registry): TextureSet {
  const P = 4; // "pixel" size: 32 px tile = 8x8 art pixels, so placeholders read as pixel art
  const terrain = reg.terrain.list.map((def, s) => {
    const [c, g] = canvas();
    for (let y = 0; y < TILE; y += P)
      for (let x = 0; x < TILE; x += P) {
        const r = hash(x, y, s);
        g.fillStyle = shade(def.color, def.solid ? 0.8 + r * 0.35 : 0.9 + r * 0.2);
        g.fillRect(x, y, P, P);
      }
    return toTexture(c);
  });

  const things = reg.things.list.map((def) => {
    const [c, g] = canvas();
    const dark = shade(def.color, 0.45);
    if (def.kind === "structure" && def.wall) {
      g.fillStyle = shade(def.color, 0.75);
      g.fillRect(0, 0, TILE, TILE);
      g.fillStyle = def.color;
      g.fillRect(0, 0, TILE, TILE - 10);
      g.fillStyle = dark;
      for (let x = 0; x < TILE; x += 8) g.fillRect(x, 4, 2, TILE - 14);
    } else if (def.kind === "plant") {
      g.fillStyle = dark;
      g.beginPath();
      g.arc(16, 18, def.blocks ? 12 : 8, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = def.color;
      g.beginPath();
      g.arc(16, 16, def.blocks ? 10 : 6, 0, Math.PI * 2);
      g.fill();
      if (def.blocks) g.fillRect(14, 16, 4, 14);
    } else if (def.kind === "stairs") {
      g.fillStyle = "rgb(20,18,16)";
      g.fillRect(4, 4, TILE - 8, TILE - 8);
      g.fillStyle = def.color;
      for (let i = 0; i < 4; i++) g.fillRect(6, 7 + i * 6, TILE - 12, 3);
    } else {
      g.fillStyle = dark;
      g.fillRect(5, 7, TILE - 10, TILE - 10);
      g.fillStyle = def.color;
      g.fillRect(4, 5, TILE - 10, TILE - 10);
    }
    g.fillStyle = "rgba(0,0,0,.65)";
    g.font = "bold 12px monospace";
    g.textAlign = "center";
    if (def.kind !== "stairs" && !def.wall) g.fillText(def.glyph, 15, 21);
    return toTexture(c);
  });

  const items = reg.items.list.map((def) => {
    const [c, g] = canvas();
    g.fillStyle = shade(def.color, 0.4);
    g.fillRect(9, 11, 16, 14);
    g.fillStyle = def.color;
    g.fillRect(8, 9, 16, 14);
    g.fillStyle = shade(def.color, 1.3);
    g.fillRect(8, 9, 16, 3);
    g.fillStyle = "rgba(0,0,0,.7)";
    g.font = "bold 11px monospace";
    g.textAlign = "center";
    g.fillText(def.glyph, 16, 21);
    return toTexture(c);
  });

  const floors = reg.floors.list.map((def, s) => {
    const [c, g] = canvas();
    for (let y = 0; y < TILE; y += 8)
      for (let x = 0; x < TILE; x += 8) {
        g.fillStyle = shade(def.color, 0.92 + hash(x, y, s + 50) * 0.14);
        g.fillRect(x, y, 8, 8);
        g.fillStyle = shade(def.color, 0.7);
        g.fillRect(x, y + 7, 8, 1);
        g.fillRect(x + 7, y, 1, 8);
      }
    return toTexture(c);
  });

  const desig = ["", "S", "M", "C", "X"].map((glyph, i) => {
    const [c, g] = canvas();
    if (i === 0) return toTexture(c);
    g.strokeStyle = "rgba(239,216,164,.9)";
    g.lineWidth = 2;
    g.setLineDash([4, 3]);
    g.strokeRect(2, 2, TILE - 4, TILE - 4);
    g.fillStyle = "rgba(27,23,20,.8)";
    g.fillRect(TILE - 13, 1, 12, 12);
    g.fillStyle = "#efd8a4";
    g.font = "bold 10px monospace";
    g.textAlign = "center";
    g.fillText(glyph, TILE - 7, 11);
    return toTexture(c);
  });

  // Survivor placeholder: white so each pawn can be tinted. Head, body, legs.
  const [pc, pg] = canvas();
  pg.fillStyle = "#ffffff";
  pg.fillRect(12, 4, 8, 8); // head
  pg.fillRect(10, 12, 12, 10); // body
  pg.fillRect(11, 22, 4, 7); // legs
  pg.fillRect(17, 22, 4, 7);
  pg.fillStyle = "rgba(0,0,0,.55)";
  pg.fillRect(17, 7, 2, 2); // eye, shows facing
  const pawn = toTexture(pc);

  const [sc, sg] = canvas();
  sg.fillStyle = "rgba(0,0,0,.35)";
  sg.beginPath();
  sg.ellipse(16, 29, 9, 3, 0, 0, Math.PI * 2);
  sg.fill();
  const shadow = toTexture(sc);

  return { terrain, things, items, floors, desig, pawn, shadow };
}
