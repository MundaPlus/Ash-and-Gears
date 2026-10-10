/**
 * "Salvage Print" items and creatures (next phase, S5). Items are small top-down objects centered in
 * the tile. Creatures and robots are seen from the side (facing east) and mirrored by the renderer.
 * Local units: one tile = 64.
 */
import { Print, type Ink, type Pt } from "./kit.ts";

type Draw = (p: Print) => void;

const drop = (p: Print, rx = 20, ry = 8) => p.tone(Print.ellipse(34, 46, rx, ry), "soot", 0.45, 3);

/** A book or manual with a colored cover and a mark. */
const book = (cover: Ink, mark: Ink): Draw => (p) => {
  drop(p, 18, 7);
  p.shape(Print.rect(16, 14, 32, 38, 3), { fill: cover, tone: { ink: "soot", amount: 0.2 }, line: true });
  p.shape(Print.rect(16, 14, 6, 38, 2), { fill: "soot", line: 1.4 });
  p.shape(Print.ellipse(36, 30, 7, 7), { fill: mark, line: 1.6 });
  p.line([[28, 44], [44, 44]], "bone", 1.4);
};
/** A crate or box of parts. */
const crate = (fill: Ink, tone: Ink, mark?: (p: Print) => void): Draw => (p) => {
  drop(p);
  p.shape(Print.rect(14, 16, 36, 30, 3), { fill, tone: { ink: tone, amount: 0.3 }, line: true });
  p.line([[14, 26], [50, 26]], tone, 1.4);
  mark?.(p);
};
/** A bottle or jug of water. */
const jug = (water: Ink): Draw => (p) => {
  drop(p, 14, 6);
  p.shape(Print.rect(22, 18, 20, 30, 6), { fill: "bone", tone: { ink: water, amount: 0.55, cell: 2.5 }, line: true });
  p.shape(Print.rect(27, 10, 10, 9, 2), { fill: "slate", line: 1.6 });
  p.shape(Print.rect(22, 30, 20, 18, 5), { fill: water, line: 1.4, shift: 0.5 });
};

const ITEMS: Partial<Record<string, Draw>> = {
  scrap: (p) => {
    drop(p);
    p.shape([[14, 40], [24, 22], [36, 34], [26, 46]], { fill: "slate", line: 2 });
    p.shape([[30, 24], [46, 20], [50, 36], [36, 40]], { fill: "rustDark", tone: { ink: "soot", amount: 0.25 }, line: 2 });
    p.line([[18, 28], [44, 44]], "slateDark", 2.2);
  },
  wood: (p) => {
    drop(p);
    for (const [y, x] of [[38, 12], [28, 16], [18, 20]] as [number, number][]) {
      p.shape(Print.capsule([x, y], [x + 34, y], 5), { fill: "ochre", tone: { ink: "ochreDark", amount: 0.3 }, line: 1.8 });
      p.shape(Print.ellipse(x + 34, y, 4, 4), { fill: "ochreDark", line: 1.4 });
    }
  },
  stone: (p) => {
    drop(p);
    for (const [x, y, r] of [[24, 36, 9], [40, 38, 8], [32, 24, 9]] as [number, number, number][]) p.shape(Print.ellipse(x, y, r, r * 0.8), { fill: "slate", tone: { ink: "slateDark", amount: 0.35 }, line: 1.8 });
  },
  coal: (p) => {
    drop(p);
    for (const [x, y, r] of [[24, 36, 8], [40, 38, 8], [32, 26, 8]] as [number, number, number][]) p.shape(Print.ellipse(x, y, r, r * 0.8), { fill: "soot", tone: { ink: "slateDark", amount: 0.3 }, line: 1.6 });
  },
  cloth: (p) => {
    drop(p);
    p.shape(Print.rect(14, 22, 36, 22, 6), { fill: "bone", tone: { ink: "paper", amount: 0.5 }, line: true });
    p.line([[16, 30], [48, 30]], "paper", 1.4);
    p.line([[16, 37], [48, 37]], "paper", 1.4);
  },
  components: crate("slate", "slateDark", (p) => {
    p.shape(Print.ellipse(26, 36, 5, 5), { fill: "ochre", line: 1.4 });
    p.shape(Print.rect(34, 31, 10, 10, 1), { fill: "rust", line: 1.4 });
  }),
  steel: (p) => {
    drop(p);
    for (const y of [36, 26]) p.shape([[12, y], [44, y], [52, y + 8], [20, y + 8]], { fill: "slate", tone: { ink: "slateDark", amount: 0.25 }, line: 1.8 });
  },
  plastic: (p) => {
    drop(p);
    p.shape(Print.rect(16, 20, 32, 26, 8), { fill: "teal", tone: { ink: "tealDark", amount: 0.25 }, line: true });
    p.line([[22, 26], [30, 26]], "bone", 2);
  },
  electronics: crate("tealDark", "soot", (p) => {
    for (const x of [20, 28, 36, 44]) p.line([[x, 30], [x, 42]], "glow", 1.4);
    p.shape(Print.rect(24, 32, 16, 8, 1), { fill: "soot", line: 1.2 });
  }),
  canned_food: (p) => {
    drop(p, 16, 6);
    for (const x of [24, 40]) {
      p.shape(Print.rect(x - 8, 18, 16, 28, 3), { fill: "slate", line: 2 });
      p.shape(Print.rect(x - 8, 26, 16, 12, 0), { fill: "rust", line: 1.4 });
    }
  },
  dirty_water: jug("tealDark"),
  clean_water: jug("teal"),
  glowcorn: (p) => {
    drop(p);
    for (const [x, a] of [[24, -0.3], [36, 0.2]] as [number, number][]) {
      const tip: Pt = [x + Math.sin(a) * 16, 20];
      p.shape(Print.capsule([x, 44], tip, 6), { fill: "ochre", tone: { ink: "glow", amount: 0.5, cell: 2.5 }, line: 1.8 });
    }
  },
  scrub_potato: (p) => {
    drop(p);
    for (const [x, y] of [[24, 36], [38, 34], [31, 26]] as Pt[]) {
      p.shape(Print.ellipse(x, y, 8, 6.5), { fill: "ochreDark", tone: { ink: "soot", amount: 0.2 }, line: 1.8 });
      p.dot(x + 2, y - 1, 1, "soot");
    }
  },
  simple_meal: (p) => {
    drop(p, 20, 7);
    p.shape(Print.ellipse(32, 34, 18, 13), { fill: "bone", line: true });
    p.shape(Print.ellipse(32, 34, 12, 8), { fill: "ochre", tone: { ink: "rust", amount: 0.35, cell: 2.5 }, line: 1.4 });
    p.dot(28, 32, 2, "teal").dot(36, 36, 2, "teal");
  },
  mutant_meat: (p) => {
    drop(p);
    p.shape(Print.ellipse(32, 34, 17, 12), { fill: "rust", tone: { ink: "glow", amount: 0.3, cell: 2.5 }, line: true });
    p.shape(Print.capsule([40, 34], [52, 26], 3), { fill: "bone", line: 1.6 });
  },
  pipe: (p) => {
    drop(p);
    p.shape(Print.capsule([14, 44], [50, 20], 3.6), { fill: "slate", tone: { ink: "slateDark", amount: 0.3 }, line: 2 });
  },
  machete: (p) => {
    drop(p);
    p.shape([[22, 42], [48, 16], [52, 20], [28, 46]], { fill: "slate", line: 2 });
    p.shape(Print.capsule([14, 50], [24, 40], 3.2), { fill: "hair", line: 1.8 });
  },
  sledgehammer: (p) => {
    drop(p);
    p.shape(Print.capsule([16, 48], [42, 22], 2.6), { fill: "ochreDark", line: 1.8 });
    p.shape([[36, 14], [50, 28], [44, 34], [30, 20]], { fill: "slateDark", line: 2 });
  },
  pipe_pistol: (p) => {
    drop(p);
    p.shape(Print.rect(16, 24, 32, 9, 3), { fill: "slate", line: 2 });
    p.shape([[18, 32], [26, 32], [24, 46], [16, 46]], { fill: "hair", line: 1.8 });
  },
  crossbow: (p) => {
    drop(p);
    p.shape(Print.capsule([18, 44], [46, 22], 2.6), { fill: "ochreDark", line: 1.8 });
    p.line([[22, 16], [36, 20], [50, 34]], "hair", 3);
    p.line([[22, 16], [50, 34]], "bone", 1.2);
  },
  scrap_shotgun: (p) => {
    drop(p);
    p.shape(Print.rect(12, 24, 40, 8, 2), { fill: "slateDark", line: 2 });
    p.shape(Print.rect(12, 32, 40, 5, 2), { fill: "slate", line: 1.6 });
    p.shape([[14, 36], [24, 36], [20, 48], [12, 46]], { fill: "ochreDark", line: 1.8 });
  },
  bandage: (p) => {
    drop(p, 14, 6);
    p.shape(Print.ellipse(32, 32, 14, 12), { fill: "bone", tone: { ink: "paper", amount: 0.4 }, line: true });
    p.shape(Print.ellipse(32, 32, 5, 4), { fill: "paper", line: 1.4 });
    p.line([[42, 38], [52, 44]], "bone", 4);
  },
  medkit: (p) => {
    drop(p);
    p.shape(Print.rect(14, 18, 36, 28, 4), { fill: "bone", line: true });
    p.shape(Print.rect(28, 22, 8, 20, 1), { fill: "rust", line: false, shift: 0 });
    p.shape(Print.rect(22, 28, 20, 8, 1), { fill: "rust", line: false, shift: 0 });
    p.shape(Print.rect(26, 13, 12, 6, 2), { fill: "slateDark", line: 1.4 });
  },
  corpse: (p) => {
    p.tone(Print.ellipse(34, 40, 24, 12), "soot", 0.45, 3);
    p.shape(Print.rect(10, 26, 46, 22, 10), { fill: "slateDark", tone: { ink: "soot", amount: 0.3 }, line: true });
    p.line([[14, 37], [52, 37]], "soot", 1.4);
    p.shape(Print.ellipse(14, 37, 7, 8), { fill: "slateDark", line: 1.8 });
  },
  factory_manual: book("ochre", "rust"),
  plastics_manual: book("teal", "bone"),
  electronics_manual: book("tealDark", "glow"),
  assembler_schematic: book("slate", "ochre"),
  reactor_manual: book("rustDark", "glow"),
  bus_manual: book("ochreDark", "bone"),
  reactor_part: crate("slateDark", "soot", (p) => {
    p.shape(Print.ellipse(32, 36, 7, 7), { fill: "glow", line: 1.6 });
  }),
  reactor_spark: (p) => {
    drop(p, 12, 5);
    p.shape([[30, 12], [42, 28], [34, 30], [40, 50], [24, 30], [32, 28]], { fill: "glow", tone: { ink: "teal", amount: 0.3 }, line: true });
  },
  armor_plates: (p) => {
    drop(p);
    for (const y of [36, 26, 16]) p.shape(Print.rect(14, y, 36, 10, 3), { fill: "slate", tone: { ink: "slateDark", amount: 0.3 }, line: 1.8 });
  },
  engine_parts: (p) => {
    drop(p);
    p.shape(Print.ellipse(26, 34, 12, 12), { fill: "slateDark", line: 2 });
    p.shape(Print.ellipse(26, 34, 4, 4), { fill: "slate", line: 1.4 });
    p.shape(Print.capsule([36, 26], [50, 40], 4), { fill: "rustDark", line: 1.8 });
  },
  bus_ready: (p) => {
    drop(p);
    p.shape(Print.rect(14, 18, 36, 28, 3), { fill: "bone", line: true });
    p.line([[18, 32], [26, 40], [44, 22]], "teal", 3);
  },
  relay_code: (p) => {
    drop(p, 14, 6);
    p.shape(Print.rect(18, 18, 28, 28, 2), { fill: "tealDark", line: true });
    for (const y of [24, 30, 36]) p.line([[22, y], [42, y]], "glow", 1.4);
  },
  signal_log: (p) => {
    drop(p, 14, 6);
    p.shape(Print.rect(16, 16, 32, 34, 2), { fill: "bone", line: true, shift: 0.6 });
    p.line([[20, 34], [26, 26], [30, 38], [36, 22], [42, 32]], "rust", 1.6);
  },
};

export function itemTile(p: Print, id: string): boolean {
  const d = ITEMS[id];
  if (!d) return false;
  d(p);
  return true;
}

/** A creature or robot, side view facing east. */
const CREATURES: Partial<Record<string, Draw>> = {
  rad_rat: (p) => {
    p.tone(Print.ellipse(32, 52, 20, 5), "soot", 0.5, 3);
    p.line([[12, 42], [4, 36], [6, 28]], "skinDark", 2.4);
    p.shape(Print.ellipse(30, 42, 18, 10), { fill: "slateDark", tone: { ink: "glow", amount: 0.25, cell: 2.5 }, line: true });
    p.shape(Print.ellipse(48, 38, 9, 7), { fill: "slateDark", line: 2 });
    p.shape(Print.ellipse(46, 30, 3.5, 4), { fill: "skin", line: 1.4 });
    p.dot(52, 36, 1.6, "glow");
    for (const x of [22, 38]) p.line([[x, 50], [x, 55]], "soot", 2);
  },
  glow_hound: (p) => {
    p.tone(Print.ellipse(32, 56, 24, 5), "soot", 0.5, 3);
    p.line([[10, 30], [4, 22]], "slateDark", 3);
    p.shape(Print.rect(10, 26, 36, 18, 8), { fill: "slateDark", tone: { ink: "glow", amount: 0.35, cell: 2.5 }, line: true });
    for (const x of [14, 22, 36, 42]) p.shape(Print.capsule([x, 42], [x, 55], 2.6), { fill: "slateDark", line: 1.6 });
    p.shape([[42, 22], [58, 26], [58, 34], [44, 36]], { fill: "slateDark", line: 2 });
    p.shape([[44, 22], [46, 12], [50, 22]], { fill: "slateDark", line: 1.6 });
    p.dot(52, 27, 2, "glow");
    p.line([[52, 33], [57, 33]], "bone", 1.4);
  },
};

/** Robots share a body: a box on legs or tracks, with a part per kind. */
const robot = (body: Ink, part: (p: Print) => void, tracks = false): Draw => (p) => {
  p.tone(Print.ellipse(32, 57, 16, 5), "soot", 0.5, 3);
  if (tracks) p.shape(Print.rect(16, 46, 32, 10, 5), { fill: "soot", line: 1.8 });
  else for (const x of [24, 40]) p.shape(Print.capsule([x, 44], [x, 55], 3.2), { fill: "slateDark", line: 1.8 });
  p.shape(Print.rect(16, 24, 32, 24, 4), { fill: body, tone: { ink: "slateDark", amount: 0.3 }, line: true });
  p.shape(Print.rect(22, 8, 20, 16, 4), { fill: "slate", line: 2 });
  p.shape(Print.rect(26, 12, 12, 6, 2), { fill: "soot", line: 1.2 });
  p.dot(30, 15, 1.5, "glow").dot(35, 15, 1.5, "glow");
  part(p);
};
Object.assign(CREATURES, {
  robot: robot("slate", (p) => p.shape(Print.capsule([46, 30], [54, 40], 3), { fill: "slate", line: 1.6 })),
  hauler_drone: (p: Print) => {
    p.tone(Print.ellipse(32, 56, 16, 4), "soot", 0.45, 3);
    p.shape(Print.rect(14, 28, 36, 14, 5), { fill: "ochre", tone: { ink: "ochreDark", amount: 0.3 }, line: true });
    for (const x of [14, 50]) {
      p.line([[x, 28], [x, 20]], "soot", 2);
      p.shape(Print.ellipse(x, 18, 9, 2.5), { fill: "slate", line: 1.4 });
    }
    glowDot(p, 32, 35);
  },
  builder_bot: robot("ochre", (p) => {
    p.shape([[20, 10], [32, 2], [44, 10]], { fill: "rust", line: 1.8 });
    p.shape(Print.capsule([46, 32], [56, 26], 2.4), { fill: "slate", line: 1.6 });
  }),
  miner_bot: robot("slateDark", (p) => p.shape([[46, 30], [60, 36], [46, 42]], { fill: "ochre", tone: { ink: "ochreDark", amount: 0.3 }, line: 1.8 }), true),
  farmer_bot: robot("teal", (p) => {
    p.line([[32, 8], [32, 0]], "soot", 1.8);
    p.shape(Print.ellipse(32, 0, 3, 3), { fill: "glow", line: 1.2 });
    p.shape(Print.rect(46, 30, 10, 12, 2), { fill: "tealDark", line: 1.6 });
  }),
  guard_bot: robot("rustDark", (p) => {
    p.shape(Print.rect(44, 30, 16, 6, 2), { fill: "soot", line: 1.6 });
    p.shape(Print.rect(26, 12, 12, 6, 2), { fill: "rust", line: 1.2 });
  }),
});
function glowDot(p: Print, x: number, y: number) {
  p.shape(Print.ellipse(x, y, 3, 3), { fill: "glow", line: 1.2 });
}

export function creatureTile(p: Print, id: string): boolean {
  const d = CREATURES[id];
  if (!d) return false;
  d(p);
  return true;
}
