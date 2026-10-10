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

/**
 * Art for things bigger than one tile. Each is its 16x16 grid with a middle band repeated
 * (columns for wide things, rows for tall ones), so the pixel size stays the same.
 * `turn` turns the grid upright first. Bands are [start, end) and chosen to repeat cleanly.
 */
const BIG_ART: Record<string, { turn?: boolean; cols?: [number, number]; rows?: [number, number]; grid?: string[] }> = {
  // Drawn upright by hand: the lying 16x16 bedroll does not turn well.
  bedroll: {
    grid: [
      "................",
      "................",
      "...0000000000...",
      "...0666666660...",
      "...0677777760...",
      "...0666666660...",
      "...0000000000...",
      "...0555555550...",
      "...0aaaaaaaa0...",
      "...09a9a9a9a0...",
      "...0aaaaaaaa0...",
      "...09a9a9a9a0...",
      "...0aaaaaaaa0...",
      "...09a9a9a9a0...",
      "...0aaaaaaaa0...",
      "...09a9a9a9a0...",
      "...0aaaaaaaa0...",
      "...09a9a9a9a0...",
      "...0aaaaaaaa0...",
      "...09a9a9a9a0...",
      "...0aaaaaaaa0...",
      "...09a9a9a9a0...",
      "...0aaaaaaaa0...",
      "...09a9a9a9a0...",
      "...0aaaaaaaa0...",
      "...09a9a9a9a0...",
      "...0999999990...",
      "...0555555550...",
      "...0444444440...",
      "...0000000000...",
      "................",
      "................",
    ],
  },
  // A double bed (2x2): two pillows, drawn whole at 32x32.
  scrap_bed: {
    grid: [
      "................................",
      ".000000000000000000000000000000.",
      ".0eeeeeeeeeeeeeeeeeeeeeeeeeeee0.",
      ".0e00000000000000000000000000e0.",
      ".0e00777777777600777777777600e0.",
      ".0e00777777777600777777777600e0.",
      ".0e00777777776600777777776600e0.",
      ".0e00666666666600666666666600e0.",
      ".0e00000000000000000000000000e0.",
      ".0e05555555555555555555555550e0.",
      ".0e04444444444444444444444440e0.",
      ".0e0a9a9a9a9a9a9a9a9a9a9a9a90e0.",
      ".0e09a9a9a9a9a9a9a9a9a9a9a9a0e0.",
      ".0e0a9a9a9a9a9a9a9a9a9a9a9a90e0.",
      ".0e09a9a9a9a9a9a9a9a9a9a9a9a0e0.",
      ".0e0a9a9a9a9a9a9a9a9a9a9a9a90e0.",
      ".0e09a9a9a9a9a9a9a9a9a9a9a9a0e0.",
      ".0e0a9a9a9a9a9a9a9a9a9a9a9a90e0.",
      ".0e09a9a9a9a9a9a9a9a9a9a9a9a0e0.",
      ".0e0a9a9a9a9a9a9a9a9a9a9a9a90e0.",
      ".0e09a9a9a9a9a9a9a9a9a9a9a9a0e0.",
      ".0e0a9a9a9a9a9a9a9a9a9a9a9a90e0.",
      ".0e09a9a9a9a9a9a9a9a9a9a9a9a0e0.",
      ".0e0a9a9a9a9a9a9a9a9a9a9a9a90e0.",
      ".0e09a9a9a9a9a9a9a9a9a9a9a9a0e0.",
      ".0e0a9a9a9a9a9a9a9a9a9a9a9a90e0.",
      ".0e09a9a9a9a9a9a9a9a9a9a9a9a0e0.",
      ".0e00000000000000000000000000e0.",
      ".0eeeeeeeeeeeeeeeeeeeeeeeeeeee0.",
      ".0d0........................0d0.",
      ".000........................000.",
      "................................",
    ],
  },
  table: { cols: [4, 12] },
  scrap_bench: { cols: [6, 10] },
  stove: { cols: [4, 12] },
  research_desk: { cols: [11, 13] },
  powered_bench: { cols: [3, 11] },
  smelter: { cols: [5, 9] },
  scrap_generator: { cols: [4, 8] },
};

/** Repeat columns [a, b) until the grid is `w` wide. */
function stretchCols(g: number[][], w: number, [a, b]: [number, number]): number[][] {
  return g.map((r) => {
    const out = r.slice(0, b);
    while (out.length < w - (r.length - b)) out.push(r[a + ((out.length - b) % (b - a))]);
    return out.concat(r.slice(b));
  });
}

/** Repeat rows [a, b) until the grid is `h` high. */
function stretchRows(g: number[][], h: number, [a, b]: [number, number]): number[][] {
  const out = g.slice(0, b);
  while (out.length < h - (g.length - b)) out.push(g[a + ((out.length - b) % (b - a))]);
  return out.concat(g.slice(b)).map((r) => [...r]);
}

/** The grid for a thing covering `fw` x `fh` tiles (16 px per tile). */
export function thingGrid(id: string, fw = 1, fh = 1): number[][] | null {
  const rows = THINGS[id];
  if (!rows) return null;
  let g = parseGrid(rows);
  if (fw === 1 && fh === 1) return g;
  const spec = BIG_ART[id] ?? {};
  if (spec.grid) return parseGrid(spec.grid);
  if (spec.turn) g = rotateGrid(g);
  const n = g.length;
  if (fw > 1) g = stretchCols(g, n * fw, spec.cols ?? [n / 2 - 2, n / 2 + 2]);
  if (fh > 1) g = stretchRows(g, n * fh, spec.rows ?? [n / 2 - 2, n / 2 + 2]);
  return g;
}

/** Things that turn 90 degrees when they run in a vertical line (art drawn for a horizontal line). */
export const TURN_IN_LINE = new Set(["sandbags"]);

/** A grid turned 90 degrees clockwise. */
export function rotateGrid(grid: number[][]): number[][] {
  const h = grid.length, w = grid[0].length;
  return Array.from({ length: w }, (_, y) => Array.from({ length: h }, (_, x) => grid[h - 1 - x][y]));
}

/**
 * A wire (or pipe) grid joined to its neighbors (WALL_* bits). The art is a horizontal line through
 * the middle; arms are cut from it and turned for north and south. One neighbor still draws a straight line,
 * unless `exact` is set (stubs under machines: only the arms in the mask).
 */
export function lineVariant(grid: number[][], mask: number, exact = false): number[][] {
  const n = grid.length;
  // Rows of the line band (any row with a painted pixel).
  const band = grid.map((r, y) => (r.some((v) => v >= 0) ? y : -1)).filter((y) => y >= 0);
  if (!exact && !(mask & (WALL_E | WALL_W)) && mask & (WALL_N | WALL_S)) mask |= WALL_N | WALL_S;
  if (!exact && !(mask & (WALL_N | WALL_S))) mask |= WALL_E | WALL_W;
  const out = Array.from({ length: n }, () => new Array<number>(n).fill(-1));
  const lo = band[0], hi = band[band.length - 1];
  for (const y of band)
    for (let x = 0; x < n; x++) {
      const east = x >= lo, west = x <= hi;
      if ((mask & WALL_E && east) || (mask & WALL_W && west) || (x >= lo && x <= hi)) out[y][x] = grid[y][x];
      // North and south arms: the same band, turned (transposed).
      if ((mask & WALL_N && x <= hi) || (mask & WALL_S && x >= lo)) out[x][y] = grid[y][x];
    }
  // Junction: line color inside, outline at the corners and on sides without an arm.
  const mid = band[Math.floor(band.length / 2)];
  const fill = grid[mid][mid];
  for (let y = lo; y <= hi; y++)
    for (let x = lo; x <= hi; x++) {
      const edgeY = y === lo ? WALL_N : y === hi ? WALL_S : 0;
      const edgeX = x === lo ? WALL_W : x === hi ? WALL_E : 0;
      if (edgeX && edgeY) out[y][x] = grid[lo][x];
      else if (edgeY) out[y][x] = mask & edgeY ? fill : grid[y][x];
      else if (edgeX) out[y][x] = mask & edgeX ? fill : grid[x][y];
      else out[y][x] = fill;
    }
  return out;
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
