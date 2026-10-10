/**
 * Textures from the palette-index art in @wc/data. Built at startup, and again when the player
 * changes palette or sprite size (settings). "16" = hand-pixeled 16 px grids drawn 2x on a
 * 32 px tile; "32" = the same grids doubled with Scale2x (smoother edges); "hybrid" = a crisp
 * 16 px world (ground, floors, structures) with smooth 32 px items and characters.
 * AI-drawn sprites (aiArt.ts) replace the grids where they exist: things in "32", items and
 * characters in "hybrid" and "32".
 */
import { Texture } from "pixi.js";
import { CREATURES, FLOORS, HAIRS, ITEMS, PALETTES, parseGrid, scale2x, SHIRTS, terrainEdge, terrainGrid, terrainLayer, TERRAIN_VARIANTS, THINGS, lineVariant, rotateGrid, thingGrid, TURN_IN_LINE, wallVariant } from "@wc/data";
import type { Registry } from "@wc/sim";
import { aiTexture, aiWallTextures, type AiArt } from "./aiArt.ts";
import { applyPrint, type PrintPeople } from "./print/textures.ts";

/** World units per tile. Sprites are drawn to this size whatever their pixel size. */
export const TILE = 32;

export type ArtSize = "16" | "32" | "hybrid";
export const ART_SIZES: ArtSize[] = ["16", "hybrid", "32"];

export type ArtStyle = "print" | "pixel";
export const ART_STYLES: ArtStyle[] = ["print", "pixel"];

export interface ArtSettings {
  /** "print" = Salvage Print (default), "pixel" = the hand-pixeled grids. */
  style: ArtStyle;
  palette: string;
  size: ArtSize;
}

export interface TextureSet {
  /** [terrain index][variant] */
  terrain: Texture[][];
  /** [terrain index][side 0 N, 1 E, 2 S, 3 W]: its dithered border to lay over a lower neighbor. */
  terrainEdges: Texture[][];
  /** Border layer per terrain index (higher spills over lower). */
  terrainLayers: number[];
  things: Texture[];
  /** Joined wall looks by neighbor mask (see wallVariant), or null for things that are not walls. */
  walls: (Texture[] | null)[];
  /** Joined wire looks by neighbor mask (see lineVariant), or null. */
  lines: (Texture[] | null)[];
  /** Wire stubs drawn under a machine, by the sides where wires touch it (index 0 unused). */
  stubs: Texture[];
  /** The 90-degree turned look for things in TURN_IN_LINE, or null. */
  turned: (Texture | null)[];
  /** Big non-square things placed turned (rotation 1 or 3), or null. */
  thingsTurned: (Texture | null)[];
  /** Things placed turned: thingsRot[rot][def] for rot 1..3 (90, 180, 270 degrees clockwise), or null. */
  thingsRot: (Texture | null)[][];
  items: Texture[];
  floors: Texture[];
  /** Order markers by Desig code (index 0 unused). */
  desig: Texture[];
  /** Survivor textures, one per shirt color. */
  survivors: Texture[];
  /** Raider looks, one is chosen per raider. */
  raiders: Texture[];
  creatures: Record<string, Texture>;
  shadow: Texture;
  /** Red cross for forbidden item stacks. */
  forbid: Texture;
  /** Rust-orange arrow for "haul now" stacks. */
  haul: Texture;
  /** Dull green-brown spots on spoiling food and bodies. */
  rot: Texture;
  /** Salvage Print people: four facings and walking frames (absent in the pixel style). */
  people?: PrintPeople;
}

function gridTexture(grid: number[][], colors: string[], remap?: Record<number, number>): Texture {
  const h = grid.length, w = grid[0].length;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let v = grid[y][x];
      if (v < 0) continue;
      if (remap && remap[v] !== undefined) v = remap[v];
      const hex = colors[v];
      const o = (y * w + x) * 4;
      img.data[o] = parseInt(hex.slice(1, 3), 16);
      img.data[o + 1] = parseInt(hex.slice(3, 5), 16);
      img.data[o + 2] = parseInt(hex.slice(5, 7), 16);
      img.data[o + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  const t = Texture.from(c);
  t.source.scaleMode = "nearest";
  return t;
}

/** A tiny canvas-drawn texture (markers, shadow, fallbacks). */
function drawn(size: number, draw: (g: CanvasRenderingContext2D) => void): Texture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d")!);
  const t = Texture.from(c);
  t.source.scaleMode = "nearest";
  return t;
}

function fallback(color: string, glyph: string): Texture {
  return drawn(TILE, (g) => {
    g.fillStyle = color;
    g.fillRect(6, 6, 20, 20);
    g.fillStyle = "rgba(0,0,0,.7)";
    g.font = "bold 12px monospace";
    g.textAlign = "center";
    g.fillText(glyph, 16, 21);
  });
}

export function makeTextures(reg: Registry, art: ArtSettings, ai: AiArt = new Map()): TextureSet {
  const pixel = makePixelTextures(reg, art, ai);
  return art.style === "print" ? applyPrint(pixel, reg, art.palette) : pixel;
}

function makePixelTextures(reg: Registry, art: ArtSettings, ai: AiArt): TextureSet {
  const colors = PALETTES[art.palette] ?? PALETTES.rust;
  const palette = PALETTES[art.palette] ? art.palette : "rust";
  /** AI looks for an id: things and floors only at "32", details (items, characters) at "hybrid" and "32". */
  const aiWorld = (id: string) => (art.size === "32" ? ai.get(id) : undefined);
  const aiDetail = (id: string) => (art.size !== "16" ? ai.get(id) : undefined);
  // World art (ground, floors, structures) and detail art (items, characters) can differ in size.
  const prepGrid = (g: number[][]) => (art.size === "32" ? scale2x(g) : g);
  const prep = (rows: string[]) => prepGrid(parseGrid(rows));
  const prepDetail = (rows: string[]) => (art.size === "16" ? parseGrid(rows) : scale2x(parseGrid(rows)));

  const terrain = reg.terrain.list.map((d) => Array.from({ length: TERRAIN_VARIANTS }, (_, v) => gridTexture(prepGrid(terrainGrid(d.id, v)), colors)));
  const terrainEdges = reg.terrain.list.map((d) => [0, 1, 2, 3].map((dir) => gridTexture(prepGrid(terrainEdge(d.id, 0, dir)), colors)));
  const terrainLayers = reg.terrain.list.map((d) => terrainLayer(d.id));
  const things = reg.things.list.map((d) => {
    const look = aiWorld(d.id)?.[0];
    if (look && !d.wall && !d.conduit && !d.pipe) return aiTexture(look, palette);
    const grid = thingGrid(d.id, ...d.footprint);
    return grid ? gridTexture(prepGrid(grid), colors) : fallback(d.color, d.glyph);
  });
  const walls = reg.things.list.map((d) => {
    const look = aiWorld(d.id)?.[0];
    if (look && d.wall && !d.door) return aiWallTextures(look, palette);
    return d.wall && !d.door && THINGS[d.id] ? Array.from({ length: 16 }, (_, m) => gridTexture(prepGrid(wallVariant(parseGrid(THINGS[d.id]), m)), colors)) : null;
  });
  const lines = reg.things.list.map((d) =>
    ((d.conduit && !d.pole && !d.switch) || d.pipe) && THINGS[d.id] ? Array.from({ length: 16 }, (_, m) => gridTexture(prepGrid(lineVariant(parseGrid(THINGS[d.id]), m)), colors)) : null,
  );
  const wireId = reg.things.list.find((d) => d.conduit && !d.pole && !d.switch && THINGS[d.id])?.id;
  const stubs = wireId ? Array.from({ length: 16 }, (_, m) => gridTexture(prepGrid(lineVariant(parseGrid(THINGS[wireId]), m, true)), colors)) : [];
  const turned = reg.things.list.map((d) => (TURN_IN_LINE.has(d.id) && THINGS[d.id] ? gridTexture(prepGrid(rotateGrid(parseGrid(THINGS[d.id]))), colors) : null));
  const thingsTurned = reg.things.list.map((d) => {
    const look = aiWorld(d.id)?.[0];
    if (look && d.footprint[0] !== d.footprint[1]) return aiTexture(look, palette, true);
    return d.footprint[0] !== d.footprint[1] && THINGS[d.id] ? gridTexture(prepGrid(rotateGrid(thingGrid(d.id, ...d.footprint)!)), colors) : null;
  });
  // Everything that can be placed turned (not walls, doors, wires, pipes or plants) gets its art turned too.
  const turnable = (d: (typeof reg.things.list)[number]) => !!THINGS[d.id] && !d.wall && !d.door && !d.conduit && !d.pipe && d.kind !== "plant";
  const thingsRot = [0, 1, 2, 3].map((rot) =>
    reg.things.list.map((d) => {
      if (rot === 0 || !turnable(d)) return null;
      let grid = thingGrid(d.id, ...d.footprint)!;
      for (let k = 0; k < rot; k++) grid = rotateGrid(grid);
      return gridTexture(prepGrid(grid), colors);
    }),
  );
  const items = reg.items.list.map((d) => {
    const look = aiDetail(d.id)?.[0];
    if (look) return aiTexture(look, palette);
    return ITEMS[d.id] ? gridTexture(prepDetail(ITEMS[d.id]), colors) : fallback(d.color, d.glyph);
  });
  const floors = reg.floors.list.map((d) => {
    const look = aiWorld(d.id)?.[0];
    if (look) return aiTexture(look, palette);
    return FLOORS[d.id] ? gridTexture(prep(FLOORS[d.id]), colors) : fallback(d.color, "=");
  });
  const survivorGrid = prepDetail(CREATURES.survivor);
  const aiPeople = aiDetail("survivor");
  const survivors = aiPeople?.length
    ? aiPeople.map((c) => aiTexture(c, palette))
    : // Twelve looks: each shirt with a hair color (survivor k wears shirt k % 6, like the UI swatch).
      Array.from({ length: SHIRTS.length * 2 }, (_, k) => {
        const [a, b, c] = SHIRTS[k % SHIRTS.length];
        const [h1, h2] = HAIRS[(k * 3) % HAIRS.length];
        return gridTexture(survivorGrid, colors, { 8: a, 9: b, 10: c, 3: h1, 4: h2 });
      });
  const aiRaiders = aiDetail("raider");
  const raiders = aiRaiders?.length ? aiRaiders.map((c) => aiTexture(c, palette)) : [gridTexture(prepDetail(CREATURES.raider), colors)];
  const creatures: Record<string, Texture> = {};
  for (const id of ["rad_rat", "glow_hound", "robot", "hauler_drone", "builder_bot", "miner_bot", "farmer_bot", "guard_bot", "rogue_bot", "old_sentry"]) {
    const look = aiDetail(id)?.[0];
    // No pixel art yet for the lair machines (N1): they borrow the guard bot's.
    creatures[id] = look ? aiTexture(look, palette) : gridTexture(prepDetail(CREATURES[id] ?? CREATURES.guard_bot), colors);
  }

  const desig = ["", "S", "M", "C", "X", "D", "F", "P"].map((glyph, i) =>
    drawn(TILE, (g) => {
      if (i === 0) return;
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
    }),
  );
  const shadow = drawn(TILE, (g) => {
    g.fillStyle = "rgba(0,0,0,.35)";
    g.beginPath();
    g.ellipse(16, 29, 9, 3, 0, 0, Math.PI * 2);
    g.fill();
  });
  const forbid = drawn(16, (g) => {
    g.strokeStyle = "#1b1714";
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(3, 3);
    g.lineTo(13, 13);
    g.moveTo(13, 3);
    g.lineTo(3, 13);
    g.stroke();
    g.strokeStyle = "#ff4a3a";
    g.lineWidth = 2.5;
    g.stroke();
  });
  // An up arrow in a dark outline: "pick this up now".
  const haul = drawn(16, (g) => {
    g.beginPath();
    g.moveTo(8, 2);
    g.lineTo(14, 9);
    g.lineTo(10, 9);
    g.lineTo(10, 14);
    g.lineTo(6, 14);
    g.lineTo(6, 9);
    g.lineTo(2, 9);
    g.closePath();
    g.fillStyle = "#d9742e";
    g.fill();
    g.strokeStyle = "#1b1714";
    g.lineWidth = 1.5;
    g.stroke();
  });
  const rot = drawn(16, (g) => {
    g.fillStyle = "#4a5a3a";
    for (const [x, y] of [[5, 6], [10, 9], [6, 11], [11, 5], [8, 8]]) g.fillRect(x, y, 1, 1);
    g.fillStyle = "#1b1714";
    g.fillRect(8, 3, 1, 1);
    g.fillRect(3, 9, 1, 1);
  });
  return { forbid, haul, rot, terrain, terrainEdges, terrainLayers, things, walls, lines, stubs, turned, thingsTurned, thingsRot, items, floors, desig, survivors, raiders, creatures, shadow };
}

/** Stable variant per tile so the ground does not repeat. */
export function variantAt(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) % TERRAIN_VARIANTS;
}
