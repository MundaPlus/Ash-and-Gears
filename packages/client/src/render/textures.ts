/**
 * Textures from the palette-index art in @wc/data. Built at startup, and again when the player
 * changes palette or sprite size (settings). "16" = hand-pixeled 16 px grids drawn 2x on a
 * 32 px tile; "32" = the same grids doubled with Scale2x (smoother edges); "hybrid" = a crisp
 * 16 px world (ground, floors, structures) with smooth 32 px items and characters.
 */
import { Texture } from "pixi.js";
import { CREATURES, FLOORS, ITEMS, PALETTES, parseGrid, scale2x, SHIRTS, terrainGrid, TERRAIN_VARIANTS, THINGS, lineVariant, rotateGrid, thingGrid, TURN_IN_LINE, wallVariant } from "@wc/data";
import type { Registry } from "@wc/sim";

/** World units per tile. Sprites are drawn to this size whatever their pixel size. */
export const TILE = 32;

export type ArtSize = "16" | "32" | "hybrid";
export const ART_SIZES: ArtSize[] = ["16", "hybrid", "32"];

export interface ArtSettings {
  palette: string;
  size: ArtSize;
}

export interface TextureSet {
  /** [terrain index][variant] */
  terrain: Texture[][];
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
  items: Texture[];
  floors: Texture[];
  /** Order markers by Desig code (index 0 unused). */
  desig: Texture[];
  /** Survivor textures, one per shirt color. */
  survivors: Texture[];
  raider: Texture;
  creatures: Record<string, Texture>;
  shadow: Texture;
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

export function makeTextures(reg: Registry, art: ArtSettings): TextureSet {
  const colors = PALETTES[art.palette] ?? PALETTES.rust;
  // World art (ground, floors, structures) and detail art (items, characters) can differ in size.
  const prepGrid = (g: number[][]) => (art.size === "32" ? scale2x(g) : g);
  const prep = (rows: string[]) => prepGrid(parseGrid(rows));
  const prepDetail = (rows: string[]) => (art.size === "16" ? parseGrid(rows) : scale2x(parseGrid(rows)));

  const terrain = reg.terrain.list.map((d) => Array.from({ length: TERRAIN_VARIANTS }, (_, v) => gridTexture(prepGrid(terrainGrid(d.id, v)), colors)));
  const things = reg.things.list.map((d) => {
    const grid = thingGrid(d.id, ...d.footprint);
    return grid ? gridTexture(prepGrid(grid), colors) : fallback(d.color, d.glyph);
  });
  const walls = reg.things.list.map((d) =>
    d.wall && !d.door && THINGS[d.id] ? Array.from({ length: 16 }, (_, m) => gridTexture(prepGrid(wallVariant(parseGrid(THINGS[d.id]), m)), colors)) : null,
  );
  const lines = reg.things.list.map((d) =>
    d.conduit && THINGS[d.id] ? Array.from({ length: 16 }, (_, m) => gridTexture(prepGrid(lineVariant(parseGrid(THINGS[d.id]), m)), colors)) : null,
  );
  const wireId = reg.things.list.find((d) => d.conduit && THINGS[d.id])?.id;
  const stubs = wireId ? Array.from({ length: 16 }, (_, m) => gridTexture(prepGrid(lineVariant(parseGrid(THINGS[wireId]), m, true)), colors)) : [];
  const turned = reg.things.list.map((d) => (TURN_IN_LINE.has(d.id) && THINGS[d.id] ? gridTexture(prepGrid(rotateGrid(parseGrid(THINGS[d.id]))), colors) : null));
  const thingsTurned = reg.things.list.map((d) =>
    d.footprint[0] !== d.footprint[1] && THINGS[d.id] ? gridTexture(prepGrid(rotateGrid(thingGrid(d.id, ...d.footprint)!)), colors) : null,
  );
  const items = reg.items.list.map((d) => (ITEMS[d.id] ? gridTexture(prepDetail(ITEMS[d.id]), colors) : fallback(d.color, d.glyph)));
  const floors = reg.floors.list.map((d) => (FLOORS[d.id] ? gridTexture(prep(FLOORS[d.id]), colors) : fallback(d.color, "=")));
  const survivorGrid = prepDetail(CREATURES.survivor);
  const survivors = SHIRTS.map(([a, b, c]) => gridTexture(survivorGrid, colors, { 8: a, 9: b, 10: c }));
  const raider = gridTexture(prepDetail(CREATURES.raider), colors);
  const creatures: Record<string, Texture> = {};
  for (const id of ["rad_rat", "glow_hound"]) creatures[id] = gridTexture(prepDetail(CREATURES[id]), colors);

  const desig = ["", "S", "M", "C", "X", "D"].map((glyph, i) =>
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
  return { terrain, things, walls, lines, stubs, turned, thingsTurned, items, floors, desig, survivors, raider, creatures, shadow };
}

/** Stable variant per tile so the ground does not repeat. */
export function variantAt(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) % TERRAIN_VARIANTS;
}
