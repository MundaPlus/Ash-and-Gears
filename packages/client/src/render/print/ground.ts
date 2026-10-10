/**
 * "Salvage Print" ground (next phase, S2): terrain tiles with variants, the soft borders a higher
 * terrain lays over a lower one, built floors, walls by material (16 joins each) and doors.
 * Local units: one tile = 64. Details stay inside the tile, so tiles never cut a pebble in half.
 */
import { Print, type Ink, type Pt } from "./kit.ts";

/** A small seeded random source per tile variant. */
function rnd(seed: number) {
  let a = (seed * 2654435761) >>> 0 || 1;
  return () => ((a = (a * 16807) % 2147483647) / 2147483647);
}

interface Ground {
  base: Ink;
  tone: Ink;
  amount: number;
  cell?: number;
  /** Extra marks drawn on top. */
  marks?: (p: Print, r: () => number) => void;
}

const pebbles = (inks: Ink[], n: number) => (p: Print, r: () => number) => {
  for (let k = 0; k < n; k++) {
    const x = 8 + r() * 48, y = 8 + r() * 48, s = 1.3 + r() * 2;
    p.shape(Print.ellipse(x, y, s * 1.3, s), { fill: inks[Math.floor(r() * inks.length)], line: 1, shift: 0.5 });
  }
};
const cracks = (ink: Ink, n: number) => (p: Print, r: () => number) => {
  for (let k = 0; k < n; k++) {
    const x = 10 + r() * 30, y = 10 + r() * 36;
    p.line([[x, y], [x + 6 + r() * 6, y + 2 + r() * 4], [x + 10 + r() * 8, y + 8 + r() * 6]], ink, 1.2);
  }
};
const both = (...fs: ((p: Print, r: () => number) => void)[]) => (p: Print, r: () => number) => fs.forEach((f) => f(p, r));

const GROUND: Record<string, Ground> = {
  dirt: { base: "ochre", tone: "ochreDark", amount: 0.14, cell: 4, marks: both(pebbles(["slate", "ochreDark"], 3), cracks("ochreDark", 1)) },
  rich_soil: { base: "ochreDark", tone: "soot", amount: 0.22, cell: 3, marks: pebbles(["ochre", "hair"], 3) },
  sand: {
    base: "paper",
    tone: "ochre",
    amount: 0.16,
    cell: 4,
    marks: (p, r) => {
      for (let k = 0; k < 2; k++) {
        const y = 14 + r() * 36;
        p.line([[8, y], [22, y - 3], [38, y], [56, y - 3]], "ochre", 1.2);
      }
    },
  },
  ash: { base: "slate", tone: "slateDark", amount: 0.25, cell: 3, marks: pebbles(["bone", "slateDark"], 3) },
  asphalt: {
    base: "slateDark",
    tone: "soot",
    amount: 0.22,
    cell: 3,
    marks: both(cracks("soot", 2), (p, r) => {
      if (r() < 0.3) p.shape(Print.rect(20 + r() * 10, 28, 16, 5, 1), { fill: "bone", line: false, shift: 0 });
    }),
  },
  rubble: {
    base: "slate",
    tone: "slateDark",
    amount: 0.2,
    cell: 3,
    marks: (p, r) => {
      for (let k = 0; k < 4; k++) {
        const x = 10 + r() * 40, y = 10 + r() * 40, s = 4 + r() * 5;
        p.shape([[x, y], [x + s, y - s * 0.6], [x + s * 1.6, y + s * 0.3], [x + s * 0.5, y + s]], { fill: r() < 0.5 ? "ochreDark" : "slateDark", line: 1.3 });
      }
    },
  },
  ruin_floor: {
    base: "paper",
    tone: "ochre",
    amount: 0.18,
    cell: 4,
    marks: (p, r) => {
      p.line([[0, 32], [64, 32]], "ochreDark", 1.4);
      p.line([[32, 0], [32, 64]], "ochreDark", 1.4);
      cracks("ochreDark", 1)(p, r);
    },
  },
  sludge: {
    base: "tealDark",
    tone: "soot",
    amount: 0.2,
    cell: 3,
    marks: (p, r) => {
      for (let k = 0; k < 2; k++) p.shape(Print.ellipse(12 + r() * 40, 12 + r() * 40, 3 + r() * 2, 2 + r() * 1.5), { fill: "teal", line: 1.1 });
    },
  },
  toxic_pool: {
    base: "glow",
    tone: "teal",
    amount: 0.25,
    cell: 3,
    marks: (p, r) => {
      for (let k = 0; k < 3; k++) p.shape(Print.ellipse(12 + r() * 40, 12 + r() * 40, 2 + r() * 2.5, 1.6 + r() * 1.5), { fill: "bone", line: 1.1 });
    },
  },
  rock: { base: "slateDark", tone: "soot", amount: 0.38, cell: 3, marks: cracks("soot", 2) },
  coal_seam: { base: "soot", tone: "slateDark", amount: 0.25, cell: 3, marks: pebbles(["slateDark", "slate"], 4) },
  scrap_vein: {
    base: "rustDark",
    tone: "soot",
    amount: 0.3,
    cell: 3,
    marks: (p, r) => {
      for (let k = 0; k < 3; k++) {
        const x = 12 + r() * 36, y = 12 + r() * 36;
        p.shape([[x, y], [x + 8, y + 2], [x + 4, y + 7]], { fill: r() < 0.5 ? "rust" : "slate", line: 1.2 });
      }
    },
  },
  rough_floor: { base: "slate", tone: "soot", amount: 0.22, cell: 3, marks: pebbles(["slateDark"], 3) },
  cave_floor: { base: "ochreDark", tone: "soot", amount: 0.3, cell: 3, marks: pebbles(["slateDark", "hair"], 3) },
  bunker_floor: {
    base: "slate",
    tone: "slateDark",
    amount: 0.16,
    cell: 4,
    marks: (p) => {
      p.line([[0, 0.8], [64, 0.8]], "slateDark", 1.4);
      p.line([[0.8, 0], [0.8, 64]], "slateDark", 1.4);
      for (const [x, y] of [[6, 6], [58, 6], [6, 58], [58, 58]] as Pt[]) p.dot(x, y, 1.4, "slateDark");
    },
  },
};

/** One terrain tile (variant 0..3). Unknown terrain: plain dirt. */
export function terrainTile(p: Print, id: string, variant: number) {
  const g = GROUND[id] ?? GROUND.dirt;
  const r = rnd(id.length * 977 + variant * 131 + 7);
  p.shape(Print.rect(0, 0, 64, 64), { fill: g.base, tone: { ink: g.tone, amount: g.amount, cell: g.cell ?? 3 }, line: false, shift: 0 });
  // A darker patch on some variants, so a field of tiles does not look like wallpaper.
  if (variant % 2 === 1) p.tone(Print.ellipse(18 + r() * 28, 18 + r() * 28, 10 + r() * 8, 7 + r() * 6), g.tone, Math.min(0.6, g.amount + 0.18), g.cell ?? 3);
  g.marks?.(p, r);
}

/** The border a terrain lays over a lower neighbor on one side (0 N, 1 E, 2 S, 3 W): a ragged halftone fringe. */
export function terrainEdgeTile(p: Print, id: string, dir: number) {
  const g = GROUND[id] ?? GROUND.dirt;
  const r = rnd(id.length * 31 + dir * 17 + 3);
  // A wavy strip along the north side, then turned for the other sides.
  const pts: Pt[] = [[0, 0], [64, 0]];
  for (let x = 64; x >= 0; x -= 8) pts.push([x, 5 + r() * 7]);
  const turn = (pt: Pt): Pt => {
    const [x, y] = pt;
    return dir === 0 ? [x, y] : dir === 1 ? [64 - y, x] : dir === 2 ? [64 - x, 64 - y] : [y, 64 - x];
  };
  p.shape(pts.map(turn), { fill: g.base, tone: { ink: g.tone, amount: g.amount, cell: g.cell ?? 3 }, line: false, shift: 0 });
}

const FLOORS: Record<string, (p: Print) => void> = {
  wood_floor: (p) => {
    p.shape(Print.rect(0, 0, 64, 64), { fill: "ochre", tone: { ink: "ochreDark", amount: 0.12, cell: 4 }, line: false, shift: 0 });
    for (const y of [0.8, 16, 32, 48]) p.line([[0, y], [64, y]], "ochreDark", 1.4);
    for (const [x, y] of [[20, 8], [52, 24], [12, 40], [40, 56]] as Pt[]) p.line([[x, y - 7], [x, y + 7]], "ochreDark", 1.2);
    for (const [x, y] of [[6, 8], [58, 24], [30, 40], [6, 56]] as Pt[]) p.dot(x, y, 1.1, "soot");
  },
  scrap_tiles: (p) => {
    p.shape(Print.rect(0, 0, 64, 64), { fill: "slate", tone: { ink: "slateDark", amount: 0.18, cell: 3 }, line: false, shift: 0 });
    p.line([[0, 0.8], [64, 0.8]], "slateDark", 1.6);
    p.line([[0.8, 0], [0.8, 64]], "slateDark", 1.6);
    p.line([[0, 32], [64, 32]], "slateDark", 1.2);
    p.tone(Print.ellipse(44, 46, 8, 5), "rust", 0.35, 3);
    for (const [x, y] of [[6, 6], [58, 6], [6, 38], [58, 38]] as Pt[]) p.dot(x, y, 1.3, "soot");
  },
  stone_tiles: (p) => {
    p.shape(Print.rect(0, 0, 64, 64), { fill: "paper", tone: { ink: "ochre", amount: 0.16, cell: 4 }, line: false, shift: 0 });
    for (const pts of [[[0, 0.8], [64, 0.8]], [[0.8, 0], [0.8, 64]], [[0, 30], [36, 30], [36, 64]], [[36, 30], [64, 30]], [[30, 0], [30, 30]]] as Pt[][]) p.line(pts, "ochreDark", 1.4);
  },
};

export function floorTile(p: Print, id: string): boolean {
  const f = FLOORS[id];
  if (!f) return false;
  f(p);
  return true;
}

/** Wall materials: top slab, its tone, the front face, and small marks. */
interface WallMat {
  top: Ink;
  tone: Ink;
  face: Ink;
  marks: (p: Print, x0: number, y0: number, x1: number, y1: number) => void;
}

const WALLS: Record<string, WallMat> = {
  stone_wall: {
    top: "paper",
    tone: "ochre",
    face: "ochreDark",
    marks: (p, x0, y0, x1, y1) => {
      p.line([[x0, (y0 + y1) / 2], [x1, (y0 + y1) / 2]], "ochreDark", 1.2);
      p.line([[(x0 + x1) / 2, y0], [(x0 + x1) / 2, (y0 + y1) / 2]], "ochreDark", 1.2);
    },
  },
  scrap_wall: {
    top: "slate",
    tone: "slateDark",
    face: "rustDark",
    marks: (p, x0, y0, x1, y1) => {
      for (let x = x0 + 8; x < x1 - 2; x += 10) p.line([[x, y0 + 2], [x, y1 - 2]], "slateDark", 1.2);
      p.tone(Print.ellipse((x0 + x1) / 2, (y0 + y1) / 2, 9, 6), "rust", 0.4, 3);
      p.dot(x0 + 5, y0 + 5, 1.3, "soot").dot(x1 - 5, y1 - 5, 1.3, "soot");
    },
  },
  wood_wall: {
    top: "ochre",
    tone: "ochreDark",
    face: "ochreDark",
    marks: (p, x0, y0, x1, y1) => {
      for (let y = y0 + 10; y < y1 - 2; y += 11) p.line([[x0 + 1, y], [x1 - 1, y]], "ochreDark", 1.3);
      p.dot(x0 + 6, y0 + 5, 1.1, "soot").dot(x1 - 6, y1 - 6, 1.1, "soot");
    },
  },
  steel_wall: {
    top: "slate",
    tone: "slateDark",
    face: "slateDark",
    marks: (p, x0, y0, x1, y1) => {
      for (const [x, y] of [[x0 + 5, y0 + 5], [x1 - 5, y0 + 5], [x0 + 5, y1 - 5], [x1 - 5, y1 - 5]] as Pt[]) p.dot(x, y, 1.5, "soot");
      p.line([[x0 + 3, (y0 + y1) / 2], [x1 - 3, (y0 + y1) / 2]], "slateDark", 1.2);
    },
  },
  ruin_wall: {
    top: "paper",
    tone: "ochreDark",
    face: "ochreDark",
    marks: (p, x0, y0, x1, y1) => {
      p.line([[x0 + 6, y0 + 10], [x0 + 16, y0 + 18], [x0 + 12, y1 - 8]], "ochreDark", 1.4);
      p.dot(x1 - 12, y0 + 10, 1.6, "rustDark");
    },
  },
  bunker_wall: {
    top: "slateDark",
    tone: "soot",
    face: "soot",
    marks: (p, x0, y0, x1, y1) => {
      p.shape(Print.rect(x0 + 4, y1 - 9, x1 - x0 - 8, 5, 0), { fill: "rust", line: false, shift: 0 });
      for (let x = x0 + 6; x < x1 - 6; x += 8) p.line([[x, y1 - 4], [x + 4, y1 - 9]], "soot", 1.6);
    },
  },
};

/** A wall tile of a material, joined to its neighbors (n, e, s, w); the open south side shows its face. */
export function wallTile(p: Print, id: string, n: boolean, e: boolean, s: boolean, w: boolean): boolean {
  const m = WALLS[id];
  if (!m) return false;
  const x0 = w ? 0 : 6, x1 = e ? 64 : 58, y0 = n ? 0 : 6, y1 = s ? 64 : 50;
  if (!s) {
    p.tone(Print.rect(x0 + 4, 60, x1 - x0, 4), "soot", 0.5, 3);
    p.shape(Print.rect(x0, y1 - 2, x1 - x0, 14), { fill: m.face, tone: { ink: "soot", amount: 0.3 }, line: false, shift: 0 });
    p.line([[x0, y1 + 12], [x1, y1 + 12]], "soot", 2.6);
    if (!w) p.line([[x0, y1 - 2], [x0, y1 + 12]], "soot", 2.6);
    if (!e) p.line([[x1, y1 - 2], [x1, y1 + 12]], "soot", 2.6);
  }
  p.shape(Print.rect(x0, y0, x1 - x0, y1 - y0), { fill: m.top, tone: { ink: m.tone, amount: 0.25, cell: 4 }, line: false, shift: 0 });
  m.marks(p, x0, y0, x1, y1);
  if (!n) p.line([[x0, y0], [x1, y0]], "soot", 2.6);
  if (!s) p.line([[x0, y1], [x1, y1]], "soot", 2.6);
  if (!w) p.line([[x0, y0], [x0, y1]], "soot", 2.6);
  if (!e) p.line([[x1, y0], [x1, y1]], "soot", 2.6);
  return true;
}

/** A door, top-down: a slab across the tile between two jambs. */
export function doorTile(p: Print, id: string) {
  const bunker = id === "bunker_door";
  p.shape(Print.rect(0, 22, 9, 20, 2), { fill: bunker ? "slateDark" : "slate", line: 2.2 });
  p.shape(Print.rect(55, 22, 9, 20, 2), { fill: bunker ? "slateDark" : "slate", line: 2.2 });
  p.shape(Print.rect(9, 26, 46, 12, 2), { fill: bunker ? "slate" : "rustDark", tone: { ink: "soot", amount: 0.25 }, line: 2.2 });
  if (bunker) for (let x = 13; x < 52; x += 8) p.line([[x, 36], [x + 4, 28]], "rust", 1.6);
  else p.dot(48, 32, 1.6, "ochre");
}
