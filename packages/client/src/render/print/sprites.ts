/**
 * "Salvage Print" sample sprites (next phase, S1): people, a wall, furniture, a machine, a belt and
 * terrain. Each draws in local units (one tile = 64) from (0, 0). Things are top-down; people are seen
 * from a high three-quarter angle with arms, tools and a pack.
 */
import { Print, type Ink, type Pt } from "./kit.ts";

export type Facing = "S" | "N" | "E" | "W";

export interface Look {
  coat: Ink;
  coatDark: Ink;
  pants: Ink;
  cap: Ink | null;
  hair: Ink;
  tool: "wrench" | "rifle" | "pipe" | null;
  raider?: boolean;
}

export const SURVIVOR: Look = { coat: "teal", coatDark: "tealDark", pants: "slateDark", cap: "rust", hair: "hair", tool: "wrench" };
export const RAIDER: Look = { coat: "rustDark", coatDark: "soot", pants: "soot", cap: null, hair: "rust", tool: "pipe", raider: true };

const C = 32; // center x of a person

function tool(p: Print, kind: Look["tool"], hand: Pt, dir: 1 | -1, up: boolean) {
  const [x, y] = hand;
  if (kind === "wrench") {
    const tip: Pt = [x + dir * 6, y - (up ? 12 : 4)];
    p.shape(Print.capsule(hand, tip, 1.8), { fill: "slate", line: 1.6 });
    p.shape(Print.ellipse(tip[0], tip[1], 4, 3.4), { fill: "slate", line: 1.6 });
    p.dot(tip[0] + dir * 1.5, tip[1] - 1.5, 1.6, "soot");
  } else if (kind === "pipe") {
    const tip: Pt = [x + dir * 12, y - (up ? 14 : 2)];
    p.shape(Print.capsule(hand, tip, 2.2), { fill: "rust", tone: { ink: "soot", amount: 0.3, cell: 2.5 }, line: 1.6 });
    p.dot(tip[0], tip[1], 1.4, "soot");
  } else if (kind === "rifle") {
    const tip: Pt = [x + dir * 16, y - 2];
    p.shape(Print.capsule(hand, tip, 2.4), { fill: "ochreDark", line: 1.6 });
  }
}

/** A person: survivor or raider, four facings, two walking frames (0 stand, 1 and 2 steps). */
export function person(p: Print, facing: Facing, frame: number, look: Look) {
  const side = facing === "E" || facing === "W";
  const dir: 1 | -1 = facing === "W" ? -1 : 1;
  const step = frame === 1 ? 2.5 : frame === 2 ? -2.5 : 0;
  const mx = (x: number) => (facing === "W" ? 64 - x : x);
  const P = (pts: Pt[]) => pts.map(([x, y]) => [mx(x), y] as Pt);

  // Ground shadow.
  p.tone(Print.ellipse(C, 57, 15, 5), "soot", 0.55, 2.5);

  // Legs and boots under the coat.
  if (side) {
    p.shape(P(Print.capsule([30 - step, 44], [28 - step * 1.6, 55], 3.6)), { fill: look.pants, line: 2 });
    p.shape(P(Print.capsule([34 + step, 44], [36 + step * 1.6, 55], 3.6)), { fill: look.pants, line: 2 });
    p.shape(P(Print.ellipse(37 + step * 1.6, 56, 4.4, 2.6)), { fill: "soot", line: 1.6 });
  } else {
    p.shape(Print.capsule([27, 44], [27, 54 + step], 3.8), { fill: look.pants, line: 2 });
    p.shape(Print.capsule([37, 44], [37, 54 - step], 3.8), { fill: look.pants, line: 2 });
    p.shape(Print.ellipse(27, 55 + step, 4.2, 2.6), { fill: "soot", line: 1.6 });
    p.shape(Print.ellipse(37, 55 - step, 4.2, 2.6), { fill: "soot", line: 1.6 });
  }

  // Pack behind the body when seen from the side.
  if (side) {
    p.shape(P(Print.rect(14, 24, 11, 19, 3)), { fill: "ochre", tone: { ink: "ochreDark", amount: 0.35 }, line: 2.2 });
    p.shape(P(Print.capsule([13, 23], [24, 23], 4)), { fill: "rust", line: 2 }); // rolled blanket
  }

  // Coat: a wide trapezoid, shaded on one side.
  const coat: Pt[] = side
    ? P([[24, 24], [40, 24], [43, 47], [21, 47]])
    : [[19, 25], [45, 25], [48, 47], [16, 47]];
  p.shape(coat, { fill: look.coat, line: true });
  const shade: Pt[] = side ? P([[33, 25], [40, 24], [43, 47], [33, 47]]) : [[38, 25], [45, 25], [48, 47], [40, 47]];
  p.tone(shade, look.coatDark, 0.5, 3);
  if (look.raider) {
    // Spiked shoulder pads: the raider silhouette.
    for (const sx of side ? [mx(32)] : [18, 46]) p.shape([[sx - 6, 27], [sx, 17], [sx + 6, 27]], { fill: "slate", line: 2 });
  }

  // Back view: the big pack with a rolled blanket on top.
  if (facing === "N") {
    p.shape(Print.rect(21, 25, 22, 21, 4), { fill: "ochre", tone: { ink: "ochreDark", amount: 0.3 }, line: 2.2 });
    p.line([[21, 33], [43, 33]], "ochreDark", 1.6);
    p.shape(Print.capsule([20, 24], [44, 24], 4.2), { fill: "rust", line: 2 });
  } else if (facing === "S" && !look.raider) {
    // Front view: pack straps.
    p.line([[24, 26], [26, 44]], "ochreDark", 2.2);
    p.line([[40, 26], [38, 44]], "ochreDark", 2.2);
  }

  // Arms: the far arm hangs, the near arm holds the tool.
  if (side) {
    const hand: Pt = [mx(40 + step), 39];
    p.shape(Print.capsule([mx(32), 28], hand, 3.6), { fill: look.coat, line: 2 });
    p.shape(Print.ellipse(hand[0], hand[1], 3.2, 3.2), { fill: "skin", line: 1.6 });
    tool(p, look.tool, hand, dir, true);
  } else {
    const back = facing === "N";
    p.shape(Print.capsule([19, 28], [15, 42 - step], 3.6), { fill: look.coat, line: 2 });
    p.shape(Print.capsule([45, 28], [49, 41 + step], 3.6), { fill: look.coat, line: 2 });
    p.shape(Print.ellipse(15, 43 - step, 3.2, 3.2), { fill: "skin", line: 1.6 });
    p.shape(Print.ellipse(49, 42 + step, 3.2, 3.2), { fill: "skin", line: 1.6 });
    if (!back) tool(p, look.tool, [49, 42 + step], 1, false);
  }

  // Head.
  const hx = side ? mx(33) : C;
  if (facing === "N") {
    p.shape(Print.ellipse(hx, 16, 10, 10), { fill: look.hair, line: true });
    if (look.cap) p.shape([[hx - 10, 15], [hx - 8, 7], [hx, 4], [hx + 8, 7], [hx + 10, 15]], { fill: look.cap, line: 2.2 });
  } else {
    p.shape(Print.ellipse(hx, 17, 10, 10), { fill: "skin", line: true });
    // A light shade on the far cheek only.
    p.tone(side ? Print.ellipse(hx - dir * 5, 19, 4.5, 7) : Print.ellipse(hx + 6, 19, 3.5, 7), "skinDark", 0.22, 2.5);
    if (side) p.shape(P([[42, 16], [45.5, 19], [42, 21]]), { fill: "skin", line: 1.6 }); // nose
    if (look.raider) {
      // Gas mask: a round snout and two filter dots.
      const sx = side ? mx(39) : C;
      p.shape(Print.ellipse(sx, 21, 6, 5), { fill: "slate", line: 2 });
      p.dot(sx - 2, 21, 1.3, "soot").dot(sx + 2, 21, 1.3, "soot");
      p.shape(side ? P([[30, 6], [34, 1], [36, 7], [40, 2], [41, 9]]) : [[26, 8], [29, 1], [32, 7], [35, 1], [38, 8]], { fill: look.hair, line: 1.8 }); // mohawk
    } else {
      // Eyes, and goggles pushed up on the cap: the survivor signature.
      if (side) p.dot(mx(38), 16, 1.3, "soot");
      else p.dot(28.5, 17.5, 1.3, "soot").dot(35.5, 17.5, 1.3, "soot");
      if (look.cap) {
        const capPts: Pt[] = side ? P([[23, 14], [25, 6], [33, 3], [41, 6], [48, 12], [41, 12]]) : [[22, 14], [24, 6], [32, 3], [40, 6], [42, 14]];
        p.shape(capPts, { fill: look.cap, tone: { ink: "rustDark", amount: 0.3 }, line: 2.2 });
      }
      const gx = side ? mx(34) : C;
      p.shape(Print.rect(gx - 9, 8, 18, 5, 2.5), { fill: "ochreDark", line: 1.6 });
      p.shape(Print.ellipse(gx - 4, 10.5, 3, 3), { fill: "teal", line: 1.4 });
      p.shape(Print.ellipse(gx + 4, 10.5, 3, 3), { fill: "teal", line: 1.4 });
    }
  }
}

/** A wall tile, top-down: a concrete slab that joins its neighbors (n, e, s, w); the open south side shows its face. */
export function wall(p: Print, n: boolean, e: boolean, s: boolean, w: boolean) {
  const x0 = w ? 0 : 6, x1 = e ? 64 : 58, y0 = n ? 0 : 6, y1 = s ? 64 : 50;
  // Fills first, then ink lines only on open sides, so joined walls read as one piece.
  if (!s) {
    // Front face and the shadow it casts.
    p.tone(Print.rect(x0 + 4, 60, x1 - x0, 6), "soot", 0.5, 2.5);
    p.shape(Print.rect(x0, y1 - 2, x1 - x0, 14), { fill: "ochreDark", tone: { ink: "soot", amount: 0.3 }, line: false, shift: 0 });
    p.line([[x0, y1 + 12], [x1, y1 + 12]], "soot", 2.6);
    if (!w) p.line([[x0, y1 - 2], [x0, y1 + 12]], "soot", 2.6);
    if (!e) p.line([[x1, y1 - 2], [x1, y1 + 12]], "soot", 2.6);
  }
  p.shape(Print.rect(x0, y0, x1 - x0, y1 - y0), { fill: "paper", tone: { ink: "ochre", amount: 0.25, cell: 4 }, line: false, shift: 0 });
  if (!n) p.line([[x0, y0], [x1, y0]], "soot", 2.6);
  if (!s) p.line([[x0, y1], [x1, y1]], "soot", 2.6);
  if (!w) p.line([[x0, y0], [x0, y1]], "soot", 2.6);
  if (!e) p.line([[x1, y0], [x1, y1]], "soot", 2.6);
  // Rebar and cracks: printed detail, not noise.
  p.line([[x0 + 10, y0 + 14], [x0 + 18, y0 + 20], [x0 + 16, y0 + 28]], "ochreDark", 1.4);
  p.dot(x1 - 14, y0 + 12, 1.6, "rustDark").dot(x1 - 20, y1 - 12, 1.6, "rustDark");
}

/** Bed (2x2), top-down: pillow at the top, blanket over the lower part. */
export function bed(p: Print) {
  p.tone(Print.rect(14, 14, 112, 112, 8), "soot", 0.5, 3);
  p.shape(Print.rect(8, 6, 112, 114, 8), { fill: "slate", tone: { ink: "slateDark", amount: 0.3 }, line: true });
  p.shape(Print.rect(16, 14, 96, 98, 6), { fill: "bone", line: 2 });
  p.shape(Print.rect(24, 20, 80, 22, 10), { fill: "bone", tone: { ink: "paper", amount: 0.5 }, line: 2 });
  p.shape(Print.rect(16, 52, 96, 60, 6), { fill: "teal", line: 2.2 });
  p.tone(Print.rect(70, 54, 40, 56, 4), "tealDark", 0.55, 3);
  p.line([[18, 62], [110, 62]], "tealDark", 2.4);
  p.line([[40, 78], [60, 86], [44, 98]], "tealDark", 1.4);
}

/** Workbench (2x1), top-down: a plank top with a vise and tools. */
export function bench(p: Print) {
  p.tone(Print.rect(10, 14, 120, 48, 4), "soot", 0.5, 3);
  p.shape(Print.rect(4, 6, 120, 48, 4), { fill: "ochre", tone: { ink: "ochreDark", amount: 0.2, cell: 4 }, line: true });
  for (const y of [22, 38]) p.line([[6, y], [122, y]], "ochreDark", 1.4);
  // Vise.
  p.shape(Print.rect(10, 12, 18, 16, 2), { fill: "slate", line: 2 });
  p.shape(Print.rect(12, 28, 14, 8, 2), { fill: "slateDark", line: 1.8 });
  // Hammer, saw and a plan sheet.
  p.shape(Print.capsule([40, 42], [58, 30], 2), { fill: "ochreDark", line: 1.6 });
  p.shape(Print.rect(54, 24, 10, 7, 1), { fill: "slate", line: 1.6 });
  p.shape([[70, 14], [104, 14], [104, 22], [74, 24]], { fill: "slate", line: 1.6 });
  p.shape(Print.rect(98, 30, 20, 18, 1), { fill: "bone", line: 1.6, shift: 0.6 });
  for (const y of [35, 39, 43]) p.line([[101, y], [114, y]], "tealDark", 1);
}

/** Battery (1x2), top-down: a steel case with cells and a charge light. */
export function battery(p: Print, charge: number) {
  p.tone(Print.rect(14, 12, 48, 114, 6), "soot", 0.5, 3);
  p.shape(Print.rect(8, 6, 48, 114, 6), { fill: "slate", tone: { ink: "slateDark", amount: 0.35 }, line: true });
  p.shape(Print.rect(14, 4, 9, 8, 2), { fill: "rust", line: 1.6 });
  p.shape(Print.rect(41, 4, 9, 8, 2), { fill: "soot", line: 1.6 });
  for (let k = 0; k < 4; k++) {
    const on = k >= 4 - Math.round(charge * 4);
    p.shape(Print.rect(16, 18 + k * 22, 32, 16, 3), { fill: on ? "glow" : "slateDark", tone: on ? { ink: "teal", amount: 0.25 } : undefined, line: 1.8 });
  }
  // Hazard band.
  p.shape(Print.rect(8, 106, 48, 10, 0), { fill: "rust", line: 1.6 });
  for (let x = 12; x < 56; x += 8) p.line([[x, 116], [x + 6, 106]], "soot", 2.2);
}

/** Conveyor (1x1), top-down, running east: rails, a dark belt and ribs at `offset` (0..8). */
export function conveyor(p: Print, offset: number) {
  p.shape(Print.rect(0, 10, 64, 44), { fill: "slateDark", tone: { ink: "soot", amount: 0.3 }, line: false, shift: 0 });
  for (let x = -8 + offset; x < 64; x += 8) if (x > 1 && x < 63) p.line([[x, 14], [x, 50]], "soot", 2);
  p.shape(Print.rect(-2, 4, 68, 9, 2), { fill: "slate", line: 2 });
  p.shape(Print.rect(-2, 51, 68, 9, 2), { fill: "slate", line: 2 });
  for (const x of [8, 40]) p.dot(x, 8.5, 1.3, "soot").dot(x, 55.5, 1.3, "soot");
}

/** Terrain: dirt and sand over `w` x `h` tiles, with pebbles and cracks. */
export function terrain(p: Print, w: number, h: number, seed: number) {
  let a = seed;
  const r = () => ((a = (a * 16807) % 2147483647) / 2147483647);
  p.shape(Print.rect(0, 0, w * 64, h * 64), { fill: "ochre", tone: { ink: "ochreDark", amount: 0.12, cell: 5 }, line: false, shift: 0 });
  // A sand drift across one corner.
  const sand: Pt[] = [[w * 64 * 0.55, 0], [w * 64, 0], [w * 64, h * 64 * 0.6], [w * 64 * 0.8, h * 64 * 0.45], [w * 64 * 0.62, h * 64 * 0.2]];
  p.shape(sand, { fill: "paper", tone: { ink: "ochre", amount: 0.18, cell: 4 }, line: false, shift: 0 });
  for (let k = 0; k < 4; k++) p.line([[w * 64 * (0.66 + k * 0.08), 8 + k * 6], [w * 64 * (0.74 + k * 0.08), 24 + k * 10]], "ochre", 1.2);
  // Darker dirt patches, pebbles and cracks.
  for (let k = 0; k < w * h * 0.6; k++) {
    const x = r() * w * 64, y = r() * h * 64;
    p.tone(Print.ellipse(x, y, 10 + r() * 14, 6 + r() * 8), "ochreDark", 0.3, 4);
  }
  for (let k = 0; k < w * h * 1.4; k++) {
    const x = r() * w * 64, y = r() * h * 64, s = 1.4 + r() * 2.2;
    p.shape(Print.ellipse(x, y, s * 1.3, s), { fill: r() < 0.5 ? "slate" : "ochreDark", line: 1.1, shift: 0.5 });
  }
  for (let k = 0; k < w * h * 0.25; k++) {
    const x = r() * w * 64, y = r() * h * 64;
    p.line([[x, y], [x + 8, y + 3], [x + 12, y + 10], [x + 20, y + 12]], "ochreDark", 1.2);
  }
}
