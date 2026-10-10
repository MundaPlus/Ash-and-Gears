/**
 * Terrain tiles as palette-index grids, made from a recipe per terrain:
 * three tones laid out by tileable value noise (soft patches, no seams between tiles),
 * then small details (pebbles, tufts, cracks, ripples, tiles, veins, bubbles).
 * Four seeded variants per terrain keep large areas from looking tiled.
 * Edges between terrains: `terrainEdge` gives a dithered border of one terrain to lay over another.
 */
type Detail = "pebbles" | "tufts" | "sprouts" | "ripples" | "cracks" | "flakes" | "rubble" | "tiles" | "plates" | "veins" | "bubbles" | "sheen" | "marks";

type Recipe = {
  /** Dark, base and light palette indexes. */
  tones: [number, number, number];
  /** How patchy the tones are: share of dark and of light (0..1). */
  dark: number;
  light: number;
  details: [Detail, ...number[]][];
  /** Higher wins at a border and spills over the neighbor. */
  layer: number;
};

const R: Record<string, Recipe> = {
  dirt: { tones: [2, 3, 4], dark: 0.1, light: 0.08, details: [["pebbles", 5, 2, 4], ["tufts", 12, 11, 0.4]], layer: 3 },
  rich_soil: { tones: [1, 2, 3], dark: 0.14, light: 0.07, details: [["sprouts", 12, 11, 4], ["pebbles", 3, 1, 2]], layer: 4 },
  sand: { tones: [4, 5, 6], dark: 0.07, light: 0.11, details: [["ripples", 6, 4], ["pebbles", 6, 4, 1]], layer: 6 },
  ash: { tones: [1, 13, 14], dark: 0.11, light: 0.09, details: [["flakes", 2, 14, 4], ["pebbles", 14, 1, 2]], layer: 2 },
  asphalt: { tones: [0, 13, 14], dark: 0.08, light: 0.05, details: [["cracks", 0, 13, 1], ["flakes", 14, 5, 1]], layer: 5 },
  rubble: { tones: [2, 3, 4], dark: 0.09, light: 0.07, details: [["rubble", 6, 5, 2, 5]], layer: 7 },
  ruin_floor: { tones: [4, 5, 6], dark: 0.05, light: 0.05, details: [["tiles", 3, 2], ["cracks", 2, 4, 1]], layer: 8 },
  sludge: { tones: [1, 11, 12], dark: 0.11, light: 0.07, details: [["sheen", 14, 12, 3]], layer: 1 },
  toxic_pool: { tones: [11, 12, 15], dark: 0.09, light: 0.11, details: [["bubbles", 15, 7, 3], ["sheen", 15, 12, 2]], layer: 0 },
  rock: { tones: [2, 3, 4], dark: 0.12, light: 0.12, details: [["cracks", 1, 5, 3], ["pebbles", 5, 1, 2]], layer: 9 },
  coal_seam: { tones: [2, 3, 4], dark: 0.12, light: 0.1, details: [["veins", 0, 13, 5], ["cracks", 1, 5, 1]], layer: 9 },
  scrap_vein: { tones: [2, 3, 4], dark: 0.12, light: 0.1, details: [["veins", 9, 10, 4], ["flakes", 14, 10, 4]], layer: 9 },
  rough_floor: { tones: [0, 1, 2], dark: 0.1, light: 0.1, details: [["marks", 0, 2, 3], ["pebbles", 2, 0, 2]], layer: 5 },
  cave_floor: { tones: [0, 1, 2], dark: 0.12, light: 0.06, details: [["pebbles", 2, 0, 4], ["flakes", 0, 2, 3]], layer: 4 },
  bunker_floor: { tones: [13, 14, 2], dark: 0.05, light: 0.05, details: [["plates", 1, 6], ["cracks", 1, 14, 1]], layer: 8 },
};

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

function hashId(id: string): number {
  let h = 2166136261;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

export const TERRAIN_VARIANTS = 4;
const N = 16;
const wrap = (v: number) => ((v % N) + N) % N;

/** Tileable value noise on a 16x16 torus: smooth blobs, made of two octaves (4 and 8 px cells). */
function noiseField(rand: () => number): number[][] {
  const octave = (cell: number) => {
    const k = N / cell;
    const pts = Array.from({ length: k }, () => Array.from({ length: k }, () => rand()));
    return (x: number, y: number) => {
      const gx = x / cell, gy = y / cell;
      const x0 = Math.floor(gx), y0 = Math.floor(gy);
      const fx = gx - x0, fy = gy - y0;
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const p = (i: number, j: number) => pts[((j % k) + k) % k][((i % k) + k) % k];
      const a = p(x0, y0) + (p(x0 + 1, y0) - p(x0, y0)) * sx;
      const b = p(x0, y0 + 1) + (p(x0 + 1, y0 + 1) - p(x0, y0 + 1)) * sx;
      return a + (b - a) * sy;
    };
  };
  const o1 = octave(8), o2 = octave(4);
  return Array.from({ length: N }, (_, y) => Array.from({ length: N }, (_, x) => o1(x, y) * 0.45 + o2(x, y) * 0.55));
}

/** 16x16 grid for terrain `id`, variant `v`. Unknown ids get a plain dirt-like tile. */
export function terrainGrid(id: string, v: number): number[][] {
  const r = R[id] ?? R.dirt;
  const rand = rng(hashId(id) + v * 7919);
  const f = noiseField(rand);
  // Tones by noise level: lows dark, highs light.
  const sorted = f.flat().sort((a, b) => a - b);
  const lo = sorted[Math.floor(r.dark * (sorted.length - 1))], hi = sorted[Math.floor((1 - r.light) * (sorted.length - 1))];
  const g = f.map((row) => row.map((n) => (n <= lo ? r.tones[0] : n >= hi ? r.tones[2] : r.tones[1])));
  const set = (x: number, y: number, c: number) => (g[wrap(y)][wrap(x)] = c);
  const ri = (n: number) => Math.floor(rand() * n);
  for (const [kind, ...a] of r.details) {
    switch (kind) {
      case "pebbles": // a: light, shadow, count
        for (let k = 0; k < a[2]; k++) {
          const x = ri(N), y = ri(N), big = rand() < 0.4;
          set(x, y, a[0]);
          if (big) set(x + 1, y, a[0]);
          set(x, y + 1, a[1]);
          if (big) set(x + 1, y + 1, a[1]);
        }
        break;
      case "tufts": // a: light green, dark green, chance per tile
        if (rand() < a[2]) {
          const x = ri(N), y = ri(N);
          set(x, y, a[1]);
          set(x - 1, y - 1, a[0]);
          set(x + 1, y - 1, a[0]);
          set(x, y - 2, a[0]);
        }
        break;
      case "sprouts": // a: light, dark, count
        for (let k = 0; k < a[2]; k++) {
          const x = ri(N), y = ri(N);
          set(x, y, a[1]);
          set(x, y - 1, a[0]);
        }
        break;
      case "ripples": // a: light, shadow — gentle waves across the tile
        for (let k = 0; k < 3; k++) {
          const y0 = ri(N), ph = rand() * 6;
          for (let x = 0; x < N; x++) {
            const y = y0 + Math.round(Math.sin((x / N) * Math.PI * 2 + ph));
            if ((x + k) % 5 === 4) continue;
            set(x, y, a[0]);
            set(x, y + 1, a[1]);
          }
        }
        break;
      case "cracks": // a: dark, edge light, count
        for (let k = 0; k < a[2]; k++) {
          let x = ri(N), y = ri(N);
          const dx = rand() < 0.5 ? 1 : -1;
          for (let i = 0; i < 5 + ri(5); i++) {
            set(x, y, a[0]);
            if (rand() < 0.3) set(x + 1, y, a[1]);
            if (rand() < 0.5) x += dx;
            else y += 1;
          }
        }
        break;
      case "flakes": // a: color, color, count
        for (let k = 0; k < a[2]; k++) set(ri(N), ri(N), rand() < 0.5 ? a[0] : a[1]);
        break;
      case "rubble": // a: top, side, shadow, count — little chunks with light top and dark shadow
        for (let k = 0; k < a[3]; k++) {
          const x = ri(N), y = ri(N), w = 1 + ri(3), h = 1 + ri(2);
          for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) set(x + xx, y + yy, yy === 0 ? a[0] : a[1]);
          for (let xx = 0; xx < w; xx++) set(x + xx + 1, y + h, a[2]);
        }
        break;
      case "tiles": // a: grout, crack — 8x8 tiles, one may be broken
        for (let i = 0; i < N; i++) {
          set(i, 7, a[0]);
          set(i, 15, a[0]);
          set(7, i, a[0]);
          set(15, i, a[0]);
        }
        if (rand() < 0.5) {
          const tx = ri(2) * 8, ty = ri(2) * 8;
          for (let k = 0; k < 4; k++) set(tx + 1 + ri(6), ty + 1 + ri(6), a[1]);
        }
        break;
      case "plates": // a: seam, rivet — 8x8 steel plates with corner rivets
        for (let i = 0; i < N; i++) {
          set(i, 7, a[0]);
          set(7, i, a[0]);
        }
        for (const [x, y] of [[1, 1], [5, 1], [1, 5], [5, 5]]) for (const [ox, oy] of [[0, 0], [8, 0], [0, 8], [8, 8]]) set(x + ox, y + oy, a[1]);
        break;
      case "veins": // a: color, glint, count
        for (let k = 0; k < a[2]; k++) {
          let x = ri(N), y = ri(N);
          for (let i = 0; i < 4 + ri(3); i++) {
            set(x, y, a[0]);
            set(x + 1, y, a[0]);
            if (rand() < 0.3) set(x, y - 1, a[1]);
            x += rand() < 0.6 ? 1 : 0;
            y += rand() < 0.6 ? 1 : -1;
          }
        }
        break;
      case "bubbles": // a: ring, center, count
        for (let k = 0; k < a[2]; k++) {
          const x = ri(N), y = ri(N);
          set(x - 1, y, a[0]);
          set(x + 1, y, a[0]);
          set(x, y - 1, a[0]);
          set(x, y + 1, a[0]);
          set(x, y, a[1]);
        }
        break;
      case "sheen": // a: light, mid, count — short shiny streaks on liquid
        for (let k = 0; k < a[2]; k++) {
          const x = ri(N), y = ri(N), w = 2 + ri(3);
          for (let i = 0; i < w; i++) set(x + i, y, i === 0 || i === w - 1 ? a[1] : a[0]);
        }
        break;
      case "marks": // a: dark, light, count — pick marks in dug stone
        for (let k = 0; k < a[2]; k++) {
          const x = ri(N), y = ri(N);
          set(x, y, a[0]);
          set(x + 1, y + 1, a[0]);
          set(x + 1, y, a[1]);
        }
        break;
    }
  }
  return g;
}

/** Layer of a terrain at borders: the higher one spills over the lower one. */
export function terrainLayer(id: string): number {
  return R[id]?.layer ?? 3;
}

/**
 * The border of terrain `id` to lay over a lower neighbor, on side `dir` of that neighbor tile
 * (0 north, 1 east, 2 south, 3 west): up to 3 pixels deep, thinning out in a dither. Empty = -1.
 */
export function terrainEdge(id: string, v: number, dir: number): number[][] {
  const src = terrainGrid(id, v);
  // Ordered dither thresholds (4x4 Bayer), so the edge breaks up in an even pattern.
  const B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  return src.map((row, y) =>
    row.map((c, x) => {
      const d = dir === 0 ? y : dir === 1 ? N - 1 - x : dir === 2 ? N - 1 - y : x;
      const keep = d === 0 ? 1 : d === 1 ? 0.7 : d === 2 ? 0.35 : 0;
      return keep > B[(y % 4) * 4 + (x % 4)] / 16 ? c : -1;
    }),
  );
}
