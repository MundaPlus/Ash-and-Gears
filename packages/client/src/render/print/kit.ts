/**
 * "Salvage Print" drawing kit (next phase, S1). Sprites are drawn in code on a canvas, like a cheap
 * two-color screen print: a few flat inks, halftone dots for shade, color layers a little off the
 * outline, and a thick soot-black outline with a slight hand-drawn wobble.
 *
 * Units: one tile is 64 units. A sprite is drawn at `scale` pixels per unit (1 = 64 px per tile).
 */

export type Ink = "soot" | "bone" | "paper" | "rust" | "rustDark" | "teal" | "tealDark" | "ochre" | "ochreDark" | "slate" | "slateDark" | "glow" | "skin" | "skinDark" | "hair";

/** Ink sets replace the pixel palettes. Each set keeps the same roles. */
export const INK_SETS: Record<string, Record<Ink, string>> = {
  rust: {
    soot: "#1f1a16",
    bone: "#eadcbd",
    paper: "#d8c39a",
    rust: "#c8612b",
    rustDark: "#8f3d1c",
    teal: "#3e7f78",
    tealDark: "#2a5752",
    ochre: "#c99d5a",
    ochreDark: "#94703c",
    slate: "#7c8487",
    slateDark: "#50585c",
    glow: "#a8e04a",
    skin: "#d9a273",
    skinDark: "#a8714b",
    hair: "#4a3328",
  },
  ash: {
    soot: "#1b1d20",
    bone: "#e2e2dc",
    paper: "#c9c8c0",
    rust: "#b0644a",
    rustDark: "#74402f",
    teal: "#5d7f93",
    tealDark: "#3f5868",
    ochre: "#a9a08c",
    ochreDark: "#757062",
    slate: "#868c92",
    slateDark: "#55595e",
    glow: "#b6e86a",
    skin: "#cfa184",
    skinDark: "#9b7058",
    hair: "#3a3634",
  },
  toxic: {
    soot: "#16190f",
    bone: "#e6e4bf",
    paper: "#c9c690",
    rust: "#b8742e",
    rustDark: "#7c4a1c",
    teal: "#5b8a3e",
    tealDark: "#3c5f28",
    ochre: "#b4a75a",
    ochreDark: "#7f753a",
    slate: "#7f8a6e",
    slateDark: "#525c46",
    glow: "#c6f04a",
    skin: "#cfa476",
    skinDark: "#9c7550",
    hair: "#3b3424",
  },
};

export type Pt = [number, number];

export interface ShapeOpts {
  /** Flat fill ink. */
  fill?: Ink;
  /** Halftone dots over the fill: ink, dot size 0..1 of the cell, cell size in units. */
  tone?: { ink: Ink; amount: number; cell?: number };
  /** Outline: true for the normal ink line, a number for its width in units, false for none. */
  line?: boolean | number;
  /** Fill offset (print error) in units; default 1. */
  shift?: number;
}

/** A small seeded random source, so the same sprite always wobbles the same way. */
function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Print {
  private rand: () => number;
  private patterns = new Map<string, CanvasPattern>();

  constructor(
    readonly ctx: CanvasRenderingContext2D,
    readonly inks: Record<Ink, string>,
    readonly scale = 1,
    seed = 1,
    /** Outline width in units. */
    readonly lineWidth = 2.6,
  ) {
    this.rand = rng(seed);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
  }

  /** Points of an ellipse. */
  static ellipse(cx: number, cy: number, rx: number, ry: number, n = 28): Pt[] {
    return Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * Math.PI * 2) * rx, cy + Math.sin((i / n) * Math.PI * 2) * ry] as Pt);
  }

  /** Points of a rectangle with round corners. */
  static rect(x: number, y: number, w: number, h: number, r = 0): Pt[] {
    if (r <= 0) return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    const out: Pt[] = [];
    const corner = (cx: number, cy: number, a0: number) => {
      for (let k = 0; k <= 4; k++) {
        const a = a0 + (k / 4) * (Math.PI / 2);
        out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
      }
    };
    corner(x + w - r, y + r, -Math.PI / 2);
    corner(x + w - r, y + h - r, 0);
    corner(x + r, y + h - r, Math.PI / 2);
    corner(x + r, y + r, Math.PI);
    return out;
  }

  /** A capsule (rounded bar) from a to b with radius r: arms, legs, pipes. */
  static capsule(a: Pt, b: Pt, r: number): Pt[] {
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const out: Pt[] = [];
    for (let k = 0; k <= 8; k++) {
      const t = ang - Math.PI / 2 - (k / 8) * Math.PI;
      out.push([a[0] + Math.cos(t) * r, a[1] + Math.sin(t) * r]);
    }
    for (let k = 0; k <= 8; k++) {
      const t = ang + Math.PI / 2 - (k / 8) * Math.PI;
      out.push([b[0] + Math.cos(t) * r, b[1] + Math.sin(t) * r]);
    }
    return out;
  }

  private path(pts: Pt[], closed: boolean, wobble: number, dx = 0, dy = 0) {
    const c = this.ctx, s = this.scale;
    // Split long edges, then nudge each point a little: the hand-drawn wobble.
    const dense: Pt[] = [];
    const n = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const steps = wobble > 0 ? Math.max(1, Math.round(len / 7)) : 1;
      for (let k = 0; k < steps; k++) dense.push([a[0] + ((b[0] - a[0]) * k) / steps, a[1] + ((b[1] - a[1]) * k) / steps]);
    }
    if (!closed) dense.push(pts[pts.length - 1]);
    c.beginPath();
    dense.forEach(([x, y], i) => {
      const jx = wobble ? (this.rand() - 0.5) * wobble : 0, jy = wobble ? (this.rand() - 0.5) * wobble : 0;
      const px = (x + jx + dx) * s, py = (y + jy + dy) * s;
      if (i === 0) c.moveTo(px, py);
      else c.lineTo(px, py);
    });
    if (closed) c.closePath();
  }

  /** A halftone dot pattern in one ink (cached per ink and size). */
  private pattern(ink: Ink, amount: number, cell: number): CanvasPattern {
    const key = `${ink}:${amount.toFixed(2)}:${cell}`;
    let p = this.patterns.get(key);
    if (!p) {
      // Print dots keep about the same size on screen at every zoom (capped scale).
      const size = Math.max(2, Math.round(cell * Math.min(this.scale, 1.25)));
      const cv = document.createElement("canvas");
      cv.width = cv.height = size * 2;
      const g = cv.getContext("2d")!;
      g.fillStyle = this.inks[ink];
      const r = Math.max(0.35, (size / 2) * Math.sqrt(amount) * 1.1);
      // Two dots per tile, offset: a 45-degree screen like a print.
      for (const [x, y] of [[size / 2, size / 2], [size * 1.5, size * 1.5]]) {
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
      }
      p = this.ctx.createPattern(cv, "repeat")!;
      this.patterns.set(key, p);
    }
    return p;
  }

  /** A filled, toned and outlined shape. */
  shape(pts: Pt[], o: ShapeOpts = {}): this {
    const c = this.ctx;
    const shift = o.shift ?? 1;
    if (o.fill) {
      this.path(pts, true, 0, shift, shift);
      c.fillStyle = this.inks[o.fill];
      c.fill();
    }
    if (o.tone) {
      c.save();
      this.path(pts, true, 0, shift, shift);
      c.clip();
      c.fillStyle = this.pattern(o.tone.ink, o.tone.amount, o.tone.cell ?? 3);
      c.fillRect(-1e4, -1e4, 2e4, 2e4);
      c.restore();
    }
    if (o.line !== false) {
      this.path(pts, true, 1.1, 0, 0);
      c.strokeStyle = this.inks.soot;
      c.lineWidth = (typeof o.line === "number" ? o.line : this.lineWidth) * this.scale;
      c.stroke();
    }
    return this;
  }

  /** Halftone shade only (no fill, no outline): a cast shadow or a shaded side. */
  tone(pts: Pt[], ink: Ink, amount: number, cell = 3): this {
    return this.shape(pts, { tone: { ink, amount, cell }, line: false, shift: 0 });
  }

  /** An ink line (open): cracks, seams, straps, details. */
  line(pts: Pt[], ink: Ink = "soot", width = 1.6): this {
    const c = this.ctx;
    this.path(pts, false, 0.8);
    c.strokeStyle = this.inks[ink];
    c.lineWidth = width * this.scale;
    c.stroke();
    return this;
  }

  /** Small round dots (rivets, eyes, lights). */
  dot(x: number, y: number, r: number, ink: Ink): this {
    const c = this.ctx;
    c.beginPath();
    c.arc(x * this.scale, y * this.scale, r * this.scale, 0, Math.PI * 2);
    c.fillStyle = this.inks[ink];
    c.fill();
    return this;
  }
}

/** Draw a sprite into a new canvas: `w` x `h` tiles at `px` pixels per tile. */
export function printSprite(w: number, h: number, px: number, inks: Record<Ink, string>, seed: number, draw: (p: Print) => void): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = Math.round(w * px);
  cv.height = Math.round(h * px);
  const ctx = cv.getContext("2d")!;
  draw(new Print(ctx, inks, px / 64, seed));
  return cv;
}
