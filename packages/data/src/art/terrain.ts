/**
 * Terrain tiles as palette-index grids, generated from a recipe per terrain:
 * a base index, speckle indices with chances, and an optional pattern.
 * Four seeded variants per terrain keep large areas from looking tiled.
 */
type Recipe = {
  base: number;
  speckle: [number, number][];
  pattern?: "cracks" | "tiles" | "stones" | "ripples" | "veins";
  patternIdx?: number[];
};

const R: Record<string, Recipe> = {
  dirt: { base: 3, speckle: [[4, 0.06], [2, 0.05], [5, 0.01]] },
  rich_soil: { base: 2, speckle: [[1, 0.075], [3, 0.05], [11, 0.015]] },
  sand: { base: 5, speckle: [[4, 0.06], [6, 0.05]] },
  ash: { base: 2, speckle: [[13, 0.1], [1, 0.05], [4, 0.02]] },
  asphalt: { base: 1, speckle: [[2, 0.06], [13, 0.03]], pattern: "cracks", patternIdx: [0] },
  rubble: { base: 3, speckle: [[2, 0.05]], pattern: "stones", patternIdx: [5, 6, 0] },
  ruin_floor: { base: 5, speckle: [[4, 0.05], [6, 0.025]], pattern: "tiles", patternIdx: [4, 3] },
  sludge: { base: 11, speckle: [[12, 0.05], [1, 0.04]], pattern: "ripples", patternIdx: [12] },
  toxic_pool: { base: 12, speckle: [[15, 0.09], [11, 0.05]], pattern: "ripples", patternIdx: [15] },
  rock: { base: 1, speckle: [[2, 0.075], [0, 0.02]], pattern: "cracks", patternIdx: [0] },
  coal_seam: { base: 1, speckle: [[0, 0.125], [13, 0.04]], pattern: "veins", patternIdx: [0, 13] },
  scrap_vein: { base: 1, speckle: [[2, 0.05]], pattern: "veins", patternIdx: [9, 10, 14] },
  rough_floor: { base: 2, speckle: [[3, 0.06], [1, 0.05]] },
  cave_floor: { base: 1, speckle: [[2, 0.1], [3, 0.015]] },
  bunker_floor: { base: 13, speckle: [[14, 0.05], [3, 0.02]], pattern: "tiles", patternIdx: [3, 1] },
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

/** 16x16 grid for terrain `id`, variant `v`. Unknown ids get a plain base tile. */
export function terrainGrid(id: string, v: number): number[][] {
  const r = R[id] ?? { base: 3, speckle: [] };
  const rand = rng(hashId(id) + v * 7919);
  const g = Array.from({ length: 16 }, () => new Array<number>(16).fill(r.base));
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++)
      for (const [idx, p] of r.speckle) if (rand() < p) g[y][x] = idx;
  const pi = r.patternIdx ?? [0];
  switch (r.pattern) {
    case "cracks": {
      // One wandering crack.
      let x = Math.floor(rand() * 16), y = 0;
      while (y < 16) {
        g[y][x] = pi[0];
        y++;
        x = Math.max(0, Math.min(15, x + Math.floor(rand() * 3) - 1));
        if (rand() < 0.3) break;
      }
      break;
    }
    case "tiles":
      for (let i = 0; i < 16; i++) {
        g[7][i] = pi[1];
        g[15][i] = pi[1];
        g[i][7] = pi[1];
        g[i][15] = pi[1];
      }
      break;
    case "stones":
      for (let k = 0; k < 6; k++) {
        const cx = Math.floor(rand() * 13), cy = Math.floor(rand() * 13), w = 2 + Math.floor(rand() * 2);
        for (let y = cy; y < cy + w; y++) for (let x = cx; x < cx + w + 1; x++) g[y][x] = pi[y === cy ? 1 : 0];
        for (let x = cx; x < cx + w + 1; x++) if (cy + w < 16) g[cy + w][x] = pi[2];
      }
      break;
    case "ripples":
      for (let k = 0; k < 4; k++) {
        const y = Math.floor(rand() * 16), x = Math.floor(rand() * 11);
        for (let i = 0; i < 4; i++) g[y][x + i] = pi[0];
      }
      break;
    case "veins":
      for (let k = 0; k < 3; k++) {
        let x = Math.floor(rand() * 16), y = Math.floor(rand() * 16);
        for (let i = 0; i < 6; i++) {
          g[y][x] = pi[Math.floor(rand() * pi.length)];
          x = Math.max(0, Math.min(15, x + Math.floor(rand() * 3) - 1));
          y = Math.max(0, Math.min(15, y + Math.floor(rand() * 3) - 1));
        }
      }
      break;
  }
  return g;
}
