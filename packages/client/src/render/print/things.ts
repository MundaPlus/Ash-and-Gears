/**
 * "Salvage Print" things (next phase, S4): every building, machine, piece of furniture, ruin and
 * plant. Things are seen from straight above with a halftone cast shadow; plants (and only plants)
 * stand up a little. Rotatable machines face east before they turn. Local units: one tile = 64.
 */
import { Print, type Ink, type Pt } from "./kit.ts";
import { battery, bed, bench, conveyor } from "./sprites.ts";

type Draw = (p: Print) => void;

/**
 * Battery cells in local units (unturned footprint), in the order they fill: each is an equal share of
 * the charge (a full battery lights all of them). The texture draws them dark; the overlay lights them.
 */
export const BATTERY_CELLS: Record<string, [number, number, number, number][]> = {
  battery: [3, 2, 1, 0].map((k) => [16, 18 + k * 22, 32, 16]),
  large_battery: [2, 3, 0, 1].map((k) => [16 + (k % 2) * 52, 18 + Math.floor(k / 2) * 46, 44, 38]),
};

// ---------------------------------------------------------------- helpers

/** A halftone cast shadow, down and to the right of a box. */
function shadow(p: Print, x: number, y: number, w: number, h: number, r = 4) {
  p.tone(Print.rect(x + 5, y + 6, w, h, r), "soot", 0.5, 3);
}
/** A shaded box with its cast shadow. */
function box(p: Print, x: number, y: number, w: number, h: number, fill: Ink, tone: Ink, r = 4, amount = 0.3) {
  shadow(p, x, y, w, h, r);
  p.shape(Print.rect(x, y, w, h, r), { fill, tone: { ink: tone, amount }, line: true });
}
function rivets(p: Print, x: number, y: number, w: number, h: number, inset = 5) {
  for (const [rx, ry] of [[x + inset, y + inset], [x + w - inset, y + inset], [x + inset, y + h - inset], [x + w - inset, y + h - inset]] as Pt[]) p.dot(rx, ry, 1.3, "soot");
}
function grill(p: Print, x: number, y: number, w: number, h: number, step = 5, ink: Ink = "soot") {
  for (let gx = x + step / 2; gx < x + w; gx += step) p.line([[gx, y], [gx, y + h]], ink, 1.3);
}
/** A round light or lamp that glows when `on`. */
function light(p: Print, x: number, y: number, r: number, on = true) {
  p.shape(Print.ellipse(x, y, r, r), { fill: on ? "glow" : "slateDark", line: 1.6 });
}
/** A small east-pointing arrow (rotatable machines face east before they turn). */
function arrow(p: Print, x: number, y: number, ink: Ink = "ochre") {
  p.shape([[x - 5, y - 5], [x + 4, y], [x - 5, y + 5]], { fill: ink, line: 1.4 });
}

// ---------------------------------------------------------------- ruins and nature

const car_wreck: Draw = (p) => {
  shadow(p, 6, 10, 52, 44, 10);
  p.shape(Print.rect(6, 10, 52, 44, 10), { fill: "rustDark", tone: { ink: "soot", amount: 0.35 }, line: true });
  p.shape(Print.rect(16, 18, 32, 28, 5), { fill: "tealDark", tone: { ink: "soot", amount: 0.3 }, line: 2 });
  p.line([[18, 20], [46, 44]], "slate", 1.4);
  p.tone(Print.ellipse(46, 18, 7, 5), "rust", 0.6, 3);
  for (const [x, y] of [[10, 14], [54, 14], [10, 50], [54, 50]] as Pt[]) p.shape(Print.ellipse(x, y, 4, 4), { fill: "soot", line: 1.4 });
};
const scrap_pile: Draw = (p) => {
  p.tone(Print.ellipse(34, 40, 26, 16), "soot", 0.45, 3);
  const bits: [Pt[], Ink][] = [
    [[[10, 40], [24, 24], [36, 38], [22, 48]], "slate"],
    [[[28, 20], [46, 18], [52, 34], [34, 36]], "rustDark"],
    [[[32, 38], [54, 36], [50, 50], [30, 50]], "slateDark"],
    [[[18, 30], [30, 16], [34, 24], [22, 34]], "rust"],
  ];
  for (const [pts, ink] of bits) p.shape(pts, { fill: ink, tone: { ink: "soot", amount: 0.2 }, line: 2 });
  p.line([[14, 22], [40, 46]], "slate", 2.4);
};
const loot_crate: Draw = (p) => {
  box(p, 12, 14, 40, 36, "ochre", "ochreDark", 3);
  p.line([[12, 26], [52, 26]], "ochreDark", 1.6);
  p.line([[12, 38], [52, 38]], "ochreDark", 1.6);
  p.line([[14, 16], [50, 48]], "ochreDark", 2);
  rivets(p, 12, 14, 40, 36, 4);
};
const dead_tree: Draw = (p) => {
  p.tone(Print.ellipse(34, 54, 16, 5), "soot", 0.5, 3);
  p.shape(Print.capsule([32, 56], [32, 22], 4.5), { fill: "hair", tone: { ink: "soot", amount: 0.3 }, line: true });
  for (const [a, b] of [[[32, 34], [18, 20]], [[32, 28], [46, 14]], [[24, 26], [20, 10]], [[40, 22], [44, 8]], [[32, 24], [32, 6]]] as [Pt, Pt][])
    p.shape(Print.capsule(a, b, 2.4), { fill: "hair", line: 1.8 });
};
const mutant_shrub: Draw = (p) => {
  p.tone(Print.ellipse(34, 50, 18, 6), "soot", 0.45, 3);
  for (const [x, y, r] of [[24, 38, 10], [40, 36, 11], [32, 26, 11], [32, 44, 9]] as [number, number, number][])
    p.shape(Print.ellipse(x, y, r, r * 0.85), { fill: "teal", tone: { ink: "tealDark", amount: 0.4 }, line: 2 });
  p.dot(28, 30, 2, "glow").dot(40, 40, 2, "glow");
};

/** Crops and trees stand up (side view); `leaf` is the main color, `fruit` small accents. */
function crop(leaf: Ink, leafDark: Ink, fruit: Ink | null, tall = false): Draw {
  return (p) => {
    p.tone(Print.ellipse(32, 56, 14, 4), "soot", 0.45, 3);
    p.shape(Print.rect(22, 50, 20, 8, 3), { fill: "ochreDark", line: 1.6 });
    const top = tall ? 8 : 18;
    p.shape(Print.capsule([32, 52], [32, top + 8], 2.2), { fill: leafDark, line: 1.6 });
    for (const [a, b] of [[[32, 44], [16, 34]], [[32, 40], [48, 30]], [[32, 32], [18, 22]], [[32, 28], [46, 18]]] as [Pt, Pt][])
      p.shape([a, [(a[0] + b[0]) / 2, b[1] - 4], b, [(a[0] + b[0]) / 2, b[1] + 6]], { fill: leaf, tone: { ink: leafDark, amount: 0.3, cell: 2.5 }, line: 1.6 });
    if (fruit) for (const [x, y] of [[32, top + 4], [24, 30], [41, 26]] as Pt[]) p.shape(Print.ellipse(x, y, 3.4, 4.2), { fill: fruit, line: 1.4 });
  };
}
const ash_willow_plant: Draw = (p) => {
  p.tone(Print.ellipse(34, 56, 18, 5), "soot", 0.5, 3);
  p.shape(Print.capsule([32, 58], [32, 24], 4.2), { fill: "hair", line: true });
  p.shape([[8, 34], [14, 14], [32, 6], [50, 14], [56, 34], [46, 30], [40, 40], [32, 32], [24, 40], [18, 30]], { fill: "teal", tone: { ink: "tealDark", amount: 0.4 }, line: true });
  for (const x of [16, 26, 38, 48]) p.line([[x, 22], [x - 2, 36]], "tealDark", 1.4);
};

const stairs = (down: boolean, dug = false): Draw => (p) => {
  p.shape(Print.rect(6, 6, 52, 52, 3), { fill: dug ? "ochreDark" : "slate", tone: { ink: "soot", amount: 0.25 }, line: true });
  for (let k = 0; k < 5; k++) {
    const y = 10 + k * 9;
    const shade = down ? 0.1 + k * 0.15 : 0.7 - k * 0.15;
    p.shape(Print.rect(10, y, 44, 7, 1), { fill: dug ? "ochre" : "slateDark", tone: { ink: "soot", amount: shade }, line: 1.4 });
  }
  p.shape(down ? [[26, 26], [38, 26], [32, 36]] : [[26, 36], [38, 36], [32, 26]], { fill: "bone", line: 1.6 });
};
const bunker_locker: Draw = (p) => {
  box(p, 10, 8, 44, 46, "slate", "slateDark", 3);
  p.line([[32, 8], [32, 54]], "slateDark", 1.8);
  grill(p, 14, 12, 14, 8, 4, "slateDark");
  grill(p, 36, 12, 14, 8, 4, "slateDark");
  p.dot(28, 34, 1.6, "rust").dot(36, 34, 1.6, "rust");
};
const old_safe: Draw = (p) => {
  box(p, 10, 10, 44, 44, "slateDark", "soot", 4);
  p.shape(Print.ellipse(32, 32, 10, 10), { fill: "slate", line: 2 });
  p.shape(Print.ellipse(32, 32, 3, 3), { fill: "soot", line: false });
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    p.line([[32 + Math.cos(a) * 7, 32 + Math.sin(a) * 7], [32 + Math.cos(a) * 9, 32 + Math.sin(a) * 9]], "soot", 1.2);
  }
  rivets(p, 10, 10, 44, 44);
};

// ---------------------------------------------------------------- furniture

const bedroll: Draw = (p) => {
  p.tone(Print.rect(16, 12, 36, 112, 10), "soot", 0.45, 3);
  p.shape(Print.rect(12, 6, 38, 114, 10), { fill: "teal", tone: { ink: "tealDark", amount: 0.35 }, line: true });
  p.shape(Print.rect(16, 10, 30, 20, 8), { fill: "bone", line: 2 });
  p.line([[14, 40], [48, 40]], "tealDark", 2);
  for (const y of [70, 100]) p.line([[14, y], [48, y]], "tealDark", 1.4);
};
const table: Draw = (p) => {
  box(p, 6, 10, 116, 42, "ochre", "ochreDark", 4, 0.2);
  for (const y of [24, 38]) p.line([[8, y], [120, y]], "ochreDark", 1.3);
  p.shape(Print.ellipse(40, 30, 7, 5), { fill: "bone", line: 1.4 });
  p.shape(Print.rect(78, 26, 10, 9, 2), { fill: "slate", line: 1.4 });
};
const chair: Draw = (p) => {
  box(p, 16, 18, 32, 30, "ochre", "ochreDark", 4, 0.2);
  p.shape(Print.rect(16, 12, 32, 9, 3), { fill: "ochreDark", line: 2 });
};
const campfire: Draw = (p) => {
  p.tone(Print.ellipse(34, 38, 22, 16), "soot", 0.4, 3);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    p.shape(Print.ellipse(32 + Math.cos(a) * 18, 32 + Math.sin(a) * 15, 5, 4), { fill: "slate", line: 1.6 });
  }
  p.shape(Print.capsule([20, 40], [44, 24], 3), { fill: "hair", line: 1.6 });
  p.shape(Print.capsule([20, 24], [44, 40], 3), { fill: "hair", line: 1.6 });
  p.shape([[24, 38], [28, 22], [32, 30], [36, 18], [40, 38]], { fill: "rust", line: 1.8 });
  p.shape([[28, 38], [31, 28], [34, 32], [36, 38]], { fill: "ochre", line: 1.4 });
};
const stove: Draw = (p) => {
  box(p, 6, 8, 116, 48, "slateDark", "soot", 4);
  for (const x of [32, 72]) {
    p.shape(Print.ellipse(x, 30, 13, 13), { fill: "soot", line: 2 });
    p.shape(Print.ellipse(x, 30, 8, 8), { fill: "slate", line: 1.4 });
  }
  p.shape(Print.rect(96, 16, 18, 30, 3), { fill: "slate", line: 1.8 });
  p.dot(105, 22, 1.8, "rust").dot(105, 30, 1.8, "rust").dot(105, 38, 1.8, "rust");
};
const well: Draw = (p) => {
  p.tone(Print.ellipse(35, 36, 24, 22), "soot", 0.4, 3);
  p.shape(Print.ellipse(32, 32, 24, 22), { fill: "paper", tone: { ink: "ochre", amount: 0.25, cell: 4 }, line: true });
  p.shape(Print.ellipse(32, 32, 14, 12), { fill: "tealDark", tone: { ink: "soot", amount: 0.4 }, line: 2 });
  p.shape(Print.rect(10, 28, 44, 7, 2), { fill: "ochreDark", line: 2 });
  p.shape(Print.rect(26, 22, 12, 9, 2), { fill: "slate", line: 1.8 });
};
const rain_collector: Draw = (p) => {
  p.tone(Print.ellipse(35, 36, 24, 22), "soot", 0.4, 3);
  p.shape(Print.ellipse(32, 32, 24, 22), { fill: "slate", tone: { ink: "slateDark", amount: 0.3 }, line: true });
  p.shape(Print.ellipse(32, 32, 18, 16), { fill: "teal", tone: { ink: "tealDark", amount: 0.3 }, line: 2 });
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    p.line([[32, 32], [32 + Math.cos(a) * 18, 32 + Math.sin(a) * 16]], "tealDark", 1.3);
  }
};
const sandbags: Draw = (p) => {
  for (const [x, y] of [[4, 16], [22, 14], [40, 16], [12, 32], [30, 32], [48, 32]] as Pt[]) {
    p.tone(Print.ellipse(x + 11, y + 12, 10, 7), "soot", 0.4, 3);
    p.shape(Print.ellipse(x + 8, y + 8, 10, 7), { fill: "ochre", tone: { ink: "ochreDark", amount: 0.3 }, line: 2 });
  }
};
const turret = (heavy: boolean): Draw => (p) => {
  const base: Ink = heavy ? "slateDark" : "slate";
  p.tone(Print.ellipse(35, 36, 22, 20), "soot", 0.45, 3);
  p.shape(Print.ellipse(32, 32, 22, 20), { fill: base, tone: { ink: "soot", amount: 0.25 }, line: true });
  p.shape(Print.ellipse(32, 32, 12, 12), { fill: heavy ? "rustDark" : "rust", line: 2 });
  for (const dy of heavy ? [-3.5, 3.5] : [0]) p.shape(Print.rect(38, 30 + dy - 2.5, 24, 5, 1.5), { fill: "soot", line: 1.6 });
  p.dot(32, 32, 2.4, "glow");
};
const research_desk: Draw = (p) => {
  box(p, 6, 8, 116, 46, "ochre", "ochreDark", 4, 0.2);
  p.shape(Print.rect(16, 14, 34, 26, 3), { fill: "slateDark", line: 2 });
  p.shape(Print.rect(20, 18, 26, 18, 2), { fill: "tealDark", tone: { ink: "glow", amount: 0.3, cell: 2.5 }, line: 1.4 });
  for (const [x, y] of [[66, 16], [80, 22], [96, 14]] as Pt[]) p.shape(Print.rect(x, y, 14, 18, 1), { fill: "bone", line: 1.4, shift: 0.6 });
  p.shape(Print.capsule([60, 44], [74, 38], 1.6), { fill: "rust", line: 1.2 });
};
const scrap_generator: Draw = (p) => {
  box(p, 6, 8, 116, 48, "rustDark", "soot", 6);
  p.shape(Print.rect(14, 16, 44, 32, 4), { fill: "slate", line: 2 });
  grill(p, 18, 20, 36, 24, 6);
  p.shape(Print.ellipse(84, 32, 14, 14), { fill: "slateDark", line: 2 });
  p.shape(Print.ellipse(84, 32, 6, 6), { fill: "slate", line: 1.4 });
  p.shape(Print.rect(104, 12, 10, 14, 2), { fill: "soot", line: 1.6 });
};
const solar_panel: Draw = (p) => {
  shadow(p, 6, 6, 116, 116, 4);
  p.shape(Print.rect(6, 6, 116, 116, 4), { fill: "tealDark", tone: { ink: "teal", amount: 0.35 }, line: true });
  for (let k = 1; k < 4; k++) {
    p.line([[6 + k * 29, 8], [6 + k * 29, 120]], "slate", 1.8);
    p.line([[8, 6 + k * 29], [120, 6 + k * 29]], "slate", 1.8);
  }
  p.line([[12, 12], [40, 40]], "bone", 1.2);
};
const wind_turbine: Draw = (p) => {
  shadow(p, 22, 22, 84, 84, 10);
  p.shape(Print.rect(22, 22, 84, 84, 10), { fill: "paper", tone: { ink: "ochre", amount: 0.25, cell: 4 }, line: true });
  p.shape(Print.ellipse(64, 64, 14, 14), { fill: "slate", line: 2.2 });
  p.dot(64, 64, 3, "soot");
};
const lamp: Draw = (p) => {
  p.tone(Print.ellipse(35, 36, 12, 12), "soot", 0.45, 3);
  p.shape(Print.ellipse(32, 32, 12, 12), { fill: "slateDark", line: true });
  light(p, 32, 32, 7);
};
const powered_bench: Draw = (p) => {
  box(p, 6, 8, 116, 46, "slate", "slateDark", 4);
  p.shape(Print.rect(14, 16, 22, 22, 3), { fill: "slateDark", line: 2 });
  p.shape(Print.ellipse(25, 27, 7, 7), { fill: "slate", line: 1.6 });
  p.shape(Print.rect(48, 16, 30, 16, 2), { fill: "ochre", line: 1.6 });
  p.shape(Print.rect(90, 14, 22, 30, 3), { fill: "soot", line: 1.6 });
  light(p, 101, 22, 3);
  p.dot(101, 32, 2, "rust");
};
const smelter: Draw = (p) => {
  box(p, 6, 8, 116, 48, "slateDark", "soot", 6);
  p.shape(Print.ellipse(40, 32, 20, 18), { fill: "rustDark", line: 2.2 });
  p.shape(Print.ellipse(40, 32, 12, 10), { fill: "rust", tone: { ink: "ochre", amount: 0.4, cell: 2.5 }, line: 1.6 });
  p.shape(Print.rect(74, 14, 38, 34, 4), { fill: "slate", line: 2 });
  p.shape(Print.rect(80, 20, 26, 10, 2), { fill: "ochre", line: 1.4 });
  p.shape(Print.ellipse(103, 18, 6, 6), { fill: "soot", line: 1.6 });
};
const loader: Draw = (p) => {
  box(p, 10, 10, 44, 44, "ochre", "ochreDark", 4);
  p.shape(Print.rect(18, 22, 28, 20, 3), { fill: "slateDark", line: 1.8 });
  arrow(p, 34, 32, "rust");
};
const auto_crafter: Draw = (p) => {
  box(p, 6, 6, 52, 52, "slate", "slateDark", 5);
  p.shape(Print.ellipse(32, 32, 12, 12), { fill: "ochre", line: 2 });
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    p.line([[32 + Math.cos(a) * 12, 32 + Math.sin(a) * 12], [32 + Math.cos(a) * 16, 32 + Math.sin(a) * 16]], "soot", 2.6);
  }
  p.dot(32, 32, 3, "soot");
  arrow(p, 52, 32, "rust");
};
const assembler: Draw = (p) => {
  box(p, 4, 4, 56, 56, "tealDark", "soot", 5);
  p.shape(Print.rect(12, 12, 40, 40, 4), { fill: "slate", line: 2 });
  grill(p, 16, 16, 32, 10, 5);
  light(p, 22, 40, 4);
  light(p, 32, 40, 4);
  light(p, 42, 40, 4, false);
  arrow(p, 54, 32, "rust");
};
const refinery: Draw = (p) => {
  box(p, 6, 8, 116, 48, "slateDark", "soot", 6);
  for (const x of [30, 62]) {
    p.shape(Print.ellipse(x, 32, 15, 15), { fill: "ochre", tone: { ink: "ochreDark", amount: 0.35 }, line: 2 });
    p.dot(x, 32, 3, "soot");
  }
  p.shape(Print.rect(86, 14, 26, 36, 4), { fill: "rustDark", line: 2 });
  p.line([[44, 32], [86, 32]], "slate", 3);
};
const robot_bay: Draw = (p) => {
  shadow(p, 6, 6, 116, 116, 6);
  p.shape(Print.rect(6, 6, 116, 116, 6), { fill: "slateDark", tone: { ink: "soot", amount: 0.3 }, line: true });
  p.shape(Print.rect(22, 22, 84, 84, 4), { fill: "slate", line: 2 });
  for (let x = 30; x < 100; x += 12) p.line([[x, 98], [x + 8, 86]], "rust", 2.2);
  p.shape(Print.ellipse(64, 56, 18, 18), { fill: "tealDark", line: 2 });
  p.shape([[60, 44], [70, 54], [62, 56], [68, 68], [56, 56], [64, 54]], { fill: "glow", line: 1.4 });
};
const belt = (mark: (p: Print) => void): Draw => (p) => {
  conveyor(p, 0);
  mark(p);
};
const belt_splitter = belt((p) => {
  p.shape(Print.rect(20, 18, 24, 28, 4), { fill: "ochre", line: 2 });
  p.line([[24, 32], [40, 22]], "soot", 2);
  p.line([[24, 32], [40, 42]], "soot", 2);
});
const belt_sorter = belt((p) => {
  p.shape(Print.rect(18, 18, 28, 28, 3), { fill: "slate", line: 2 });
  grill(p, 20, 20, 24, 24, 5);
  p.dot(32, 32, 3.5, "rust");
});
const tunnel = (out: boolean): Draw => (p) => {
  conveyor(p, 0);
  const x = out ? 6 : 26;
  p.shape(Print.rect(x, 6, 32, 52, 6), { fill: "slateDark", tone: { ink: "soot", amount: 0.3 }, line: true });
  p.shape(Print.rect(out ? x + 18 : x + 4, 16, 10, 32, 3), { fill: "soot", line: 1.6 });
};
const robot_arm: Draw = (p) => {
  p.tone(Print.ellipse(34, 36, 14, 14), "soot", 0.45, 3);
  p.shape(Print.ellipse(32, 32, 13, 13), { fill: "slateDark", line: true });
  p.shape(Print.capsule([32, 32], [52, 32], 4), { fill: "ochre", line: 2 });
  p.shape(Print.capsule([52, 32], [58, 24], 2.2), { fill: "slate", line: 1.6 });
  p.shape(Print.capsule([52, 32], [58, 40], 2.2), { fill: "slate", line: 1.6 });
  p.dot(32, 32, 3, "soot");
};
const scrap_chest: Draw = (p) => {
  box(p, 10, 12, 44, 40, "rustDark", "soot", 3);
  p.line([[10, 26], [54, 26]], "soot", 1.6);
  p.shape(Print.rect(28, 22, 8, 8, 1), { fill: "ochre", line: 1.4 });
  rivets(p, 10, 12, 44, 40, 4);
};
const water_pump: Draw = (p) => {
  box(p, 12, 12, 40, 40, "teal", "tealDark", 6);
  p.shape(Print.ellipse(32, 32, 10, 10), { fill: "slate", line: 2 });
  for (let k = 0; k < 4; k++) p.line([[32, 32], [32 + Math.cos(k * 1.57) * 9, 32 + Math.sin(k * 1.57) * 9]], "soot", 1.6);
};
const water_tank: Draw = (p) => {
  p.tone(Print.ellipse(35, 36, 24, 24), "soot", 0.45, 3);
  p.shape(Print.ellipse(32, 32, 24, 24), { fill: "tealDark", tone: { ink: "soot", amount: 0.25 }, line: true });
  p.shape(Print.ellipse(32, 32, 16, 16), { fill: "teal", line: 2 });
  p.shape(Print.ellipse(32, 32, 5, 5), { fill: "slate", line: 1.6 });
};
const water_purifier: Draw = (p) => {
  box(p, 6, 8, 116, 48, "slate", "slateDark", 5);
  for (const x of [28, 60]) p.shape(Print.rect(x - 12, 16, 24, 32, 6), { fill: "teal", tone: { ink: "tealDark", amount: 0.3 }, line: 2 });
  p.shape(Print.rect(84, 18, 28, 28, 3), { fill: "slateDark", line: 1.8 });
  light(p, 98, 32, 5);
};
const water_tap: Draw = (p) => {
  box(p, 18, 18, 28, 28, "slate", "slateDark", 4);
  p.shape(Print.capsule([32, 32], [46, 32], 3.4), { fill: "slateDark", line: 1.8 });
  p.dot(32, 32, 4, "teal");
};
const fuel_still: Draw = (p) => {
  box(p, 6, 8, 116, 48, "rustDark", "soot", 5);
  p.shape(Print.ellipse(36, 32, 18, 18), { fill: "ochreDark", tone: { ink: "soot", amount: 0.3 }, line: 2 });
  p.line([[54, 32], [70, 22], [86, 32], [100, 22]], "slate", 3);
  p.shape(Print.rect(96, 30, 18, 20, 3), { fill: "slate", line: 1.8 });
};
const reactor_console: Draw = (p) => {
  shadow(p, 6, 6, 116, 116, 6);
  p.shape(Print.rect(6, 6, 116, 116, 6), { fill: "slateDark", tone: { ink: "soot", amount: 0.3 }, line: true });
  p.shape(Print.ellipse(64, 60, 30, 30), { fill: "slate", line: 2.4 });
  p.shape(Print.ellipse(64, 60, 18, 18), { fill: "glow", tone: { ink: "teal", amount: 0.35 }, line: 2 });
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 - Math.PI / 2;
    p.shape([[64, 60], [64 + Math.cos(a - 0.4) * 16, 60 + Math.sin(a - 0.4) * 16], [64 + Math.cos(a + 0.4) * 16, 60 + Math.sin(a + 0.4) * 16]], { fill: "soot", line: false, shift: 0 });
  }
  p.shape(Print.rect(14, 104, 100, 12, 2), { fill: "rust", line: 1.8 });
  for (let x = 20; x < 110; x += 10) p.dot(x, 110, 2, x % 20 ? "glow" : "bone");
};
const school_bus: Draw = (p) => {
  shadow(p, 6, 10, 180, 108, 14);
  p.shape(Print.rect(6, 10, 180, 108, 14), { fill: "ochre", tone: { ink: "ochreDark", amount: 0.25, cell: 4 }, line: true });
  p.shape(Print.rect(150, 18, 30, 92, 8), { fill: "slateDark", tone: { ink: "teal", amount: 0.3 }, line: 2 });
  for (let x = 20; x < 140; x += 22) p.shape(Print.rect(x, 22, 16, 84, 3), { fill: "paper", line: 1.6 });
  p.line([[10, 64], [182, 64]], "soot", 2.2);
  p.tone(Print.ellipse(60, 90, 16, 10), "rust", 0.5, 3);
};
const satellite_dish: Draw = (p) => {
  p.tone(Print.ellipse(100, 102, 80, 76), "soot", 0.4, 3);
  p.shape(Print.ellipse(96, 96, 80, 76), { fill: "bone", tone: { ink: "paper", amount: 0.45, cell: 4 }, line: true });
  for (const r of [56, 34]) p.shape(Print.ellipse(96, 96, r, r * 0.95), { fill: "paper", line: 1.6, shift: 0 });
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.5;
    p.line([[96 + Math.cos(a) * 74, 96 + Math.sin(a) * 70], [96, 96]], "slateDark", 2.4);
  }
  p.shape(Print.ellipse(96, 96, 10, 10), { fill: "rust", line: 2 });
  p.dot(96, 96, 3, "glow");
};
const card_table: Draw = (p) => {
  box(p, 10, 12, 44, 40, "ochreDark", "soot", 6, 0.2);
  p.shape(Print.rect(14, 16, 36, 32, 4), { fill: "teal", tone: { ink: "tealDark", amount: 0.3 }, line: 1.6 });
  for (const [x, y, ink] of [[20, 22, "bone"], [34, 28, "bone"], [26, 36, "rust"]] as [number, number, Ink][]) p.shape(Print.rect(x, y, 8, 10, 1), { fill: ink, line: 1.2, shift: 0.5 });
};
const horseshoe_pit: Draw = (p) => {
  p.shape(Print.rect(8, 8, 48, 48, 3), { fill: "paper", tone: { ink: "ochre", amount: 0.3, cell: 4 }, line: true });
  p.shape(Print.ellipse(32, 32, 3, 3), { fill: "slateDark", line: 1.6 });
  for (const [x, y] of [[20, 20], [42, 44]] as Pt[]) p.line([[x - 5, y + 4], [x - 5, y - 2], [x, y - 5], [x + 5, y - 2], [x + 5, y + 4]], "slate", 2.4);
};
const grave: Draw = (p) => {
  p.shape(Print.rect(16, 10, 32, 46, 5), { fill: "soot", tone: { ink: "hair", amount: 0.3 }, line: true });
  p.shape(Print.ellipse(32, 8, 14, 5), { fill: "ochreDark", line: 1.8 });
};
const electric_heater: Draw = (p) => {
  box(p, 10, 10, 44, 44, "slate", "slateDark", 4);
  for (let y = 18; y < 48; y += 8) p.shape(Print.rect(16, y, 32, 4, 2), { fill: "rust", line: 1.2 });
};
const electric_cooler: Draw = (p) => {
  box(p, 10, 10, 44, 44, "slate", "slateDark", 4);
  p.shape(Print.ellipse(32, 32, 14, 14), { fill: "bone", line: 2 });
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2;
    p.line([[32, 32], [32 + Math.cos(a) * 12, 32 + Math.sin(a) * 12]], "tealDark", 2.4);
  }
};
const large_battery: Draw = (p) => {
  shadow(p, 6, 6, 116, 116, 6);
  p.shape(Print.rect(6, 6, 116, 116, 6), { fill: "slate", tone: { ink: "slateDark", amount: 0.35 }, line: true });
  for (const [x, y, w, h] of BATTERY_CELLS.large_battery) p.shape(Print.rect(x, y, w, h, 4), { fill: "slateDark", line: 1.8 });
  p.shape(Print.rect(6, 108, 116, 10, 0), { fill: "rust", line: 1.6 });
};
const power_pole: Draw = (p) => {
  p.tone(Print.ellipse(35, 35, 9, 9), "soot", 0.5, 3);
  p.shape(Print.ellipse(32, 32, 8, 8), { fill: "hair", line: true });
  p.shape(Print.rect(18, 29, 28, 6, 2), { fill: "ochreDark", line: 1.6 });
  p.dot(20, 32, 2, "bone").dot(44, 32, 2, "bone");
};
const power_switch: Draw = (p) => {
  box(p, 16, 14, 32, 36, "slate", "slateDark", 3);
  p.shape(Print.rect(28, 20, 8, 24, 3), { fill: "soot", line: 1.4 });
  p.shape(Print.rect(26, 20, 12, 10, 2), { fill: "rust", line: 1.4 });
};

/** Every thing with a print drawing, by id. */
export const PRINT_THINGS: Partial<Record<string, Draw>> = {
  car_wreck, scrap_pile, loot_crate, dead_tree, mutant_shrub,
  stairs_down: stairs(true), stairs_up: stairs(false), dug_stairs: stairs(true, true),
  bunker_locker, old_safe, bedroll, table, chair, campfire, stove,
  glowcorn_plant: crop("teal", "tealDark", "glow", true),
  scrub_potato_plant: crop("teal", "tealDark", "ochre"),
  fiber_weed_plant: crop("ochre", "ochreDark", "bone", true),
  ash_willow_plant,
  well, rain_collector, sandbags, scrap_turret: turret(false), heavy_turret: turret(true),
  research_desk, scrap_generator, solar_panel, wind_turbine, lamp, powered_bench, smelter,
  loader, auto_crafter, assembler, refinery, robot_bay,
  belt_splitter, belt_sorter, tunnel_in: tunnel(false), tunnel_out: tunnel(true), robot_arm, scrap_chest,
  water_pump, water_tank, water_purifier, water_tap, fuel_still,
  reactor_console, school_bus, satellite_dish,
  card_table, horseshoe_pit, grave, electric_heater, electric_cooler, large_battery,
  power_pole, power_switch,
  scrap_bed: (p) => bed(p), scrap_bench: (p) => bench(p), battery: (p) => battery(p, 0), conveyor: (p) => conveyor(p, 0),
};

/** Wires and pipes, joined to their neighbors (mask: 1 N, 2 E, 4 S, 8 W). A lone piece draws a short bar. */
export function lineTile(p: Print, kind: "wire" | "pipe", mask: number) {
  const pipe = kind === "pipe";
  const r = pipe ? 6 : 2.6;
  const ink: Ink = pipe ? "slate" : "rust";
  const arms: Pt[] = [];
  if (mask & 1) arms.push([32, -2]);
  if (mask & 2) arms.push([66, 32]);
  if (mask & 4) arms.push([32, 66]);
  if (mask & 8) arms.push([-2, 32]);
  if (!arms.length) arms.push([14, 32], [50, 32]);
  for (const a of arms) p.shape(Print.capsule([32, 32], a, r), { fill: ink, tone: pipe ? { ink: "slateDark", amount: 0.3 } : undefined, line: pipe ? 2 : 1.6 });
  p.shape(Print.ellipse(32, 32, r + 1.5, r + 1.5), { fill: pipe ? "slateDark" : "rustDark", line: pipe ? 2 : 1.6 });
}
