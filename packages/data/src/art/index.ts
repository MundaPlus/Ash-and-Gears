/**
 * Game art as palette-index grids (hand-pixeled 16 px sprites + generated terrain).
 * The client turns these into textures at startup in the chosen palette and size,
 * so palette and sprite size are live settings. texel-studio sprites can replace entries by id.
 */
import { CREATURES, FLOORS, ITEMS } from "./items.ts";
import { THINGS } from "./things.ts";

export { terrainGrid, TERRAIN_VARIANTS } from "./terrain.ts";
export { THINGS, ITEMS, CREATURES, FLOORS };

/** Palettes share index roles: 0-7 neutral ramp, 8-10 rust, 11-12 plants, 13-14 metal, 15 glow. */
export const PALETTES: Record<string, string[]> = {
  rust: ["#1b1714", "#3a2e26", "#5c4636", "#84603f", "#b0834e", "#d6ab6b", "#efd8a4", "#f6efe0", "#6b2b1a", "#a8481a", "#d9742e", "#4a5a3a", "#7a8a4e", "#3d4a52", "#6f8088", "#9fd14a"],
  toxic: ["#0f1410", "#1f2a1e", "#34452f", "#4f6644", "#73895c", "#a3b57a", "#d4dca8", "#f1f3dc", "#5a3a22", "#8c6236", "#e9533b", "#4f8a2a", "#7fd12a", "#4d6670", "#8aa1a6", "#c6ff3a"],
  ash: ["#121519", "#232930", "#39424c", "#56616d", "#7b8794", "#a6b0ba", "#d0d6dc", "#f0f2f4", "#8a3b2e", "#c2603f", "#e3c25a", "#4f6b5a", "#8fae7e", "#3b4f63", "#6d86a0", "#b8e05a"],
};

/** Shirt color ramps for survivors (replace indices 8, 9, 10 of the survivor sprite). */
export const SHIRTS: [number, number, number][] = [
  [8, 9, 10],
  [11, 12, 12],
  [13, 14, 14],
  [2, 3, 4],
  [1, 2, 13],
  [9, 10, 5],
];

export function parseGrid(rows: string[]): number[][] {
  return rows.map((r) => [...r].map((c) => (c === "." || c === " " ? -1 : parseInt(c, 16))));
}

/** Neighbor bits for wall joins. */
export const WALL_N = 1, WALL_E = 2, WALL_S = 4, WALL_W = 8;

/**
 * A 16x16 wall grid joined to its neighbors (mask of WALL_* bits).
 * A wall below hides this tile's front face (rows 12-15), so a vertical run reads as one wall.
 * A wall to a side or above removes the outline on that side.
 */
export function wallVariant(grid: number[][], mask: number): number[][] {
  const g = grid.map((r) => [...r]);
  const n = g.length;
  if (mask & WALL_S) for (let y = 12; y < n; y++) g[y] = [...grid[y - 11]];
  if (mask & WALL_N) g[0] = [...g[1]];
  for (const row of g) {
    if (mask & WALL_E) row[n - 1] = row[n - 2];
    if (mask & WALL_W) row[0] = row[1];
  }
  return g;
}

/** Scale2x / EPX: doubles a sprite and smooths diagonal edges without new colors. */
export function scale2x(src: number[][]): number[][] {
  const h = src.length, w = src[0].length;
  const at = (x: number, y: number) => src[Math.max(0, Math.min(h - 1, y))][Math.max(0, Math.min(w - 1, x))];
  const out = Array.from({ length: h * 2 }, () => new Array<number>(w * 2).fill(-1));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const p = at(x, y), a = at(x, y - 1), b = at(x + 1, y), c = at(x - 1, y), d = at(x, y + 1);
      out[y * 2][x * 2] = c === a && c !== d && a !== b ? a : p;
      out[y * 2][x * 2 + 1] = a === b && a !== c && b !== d ? b : p;
      out[y * 2 + 1][x * 2] = d === c && d !== b && c !== a ? c : p;
      out[y * 2 + 1][x * 2 + 1] = b === d && b !== a && d !== c ? d : p;
    }
  return out;
}

/** Every sprite id with its grid, for checks and tools. */
export function allSprites(): Record<string, string[]> {
  return { ...THINGS, ...ITEMS, ...CREATURES, ...FLOORS };
}
