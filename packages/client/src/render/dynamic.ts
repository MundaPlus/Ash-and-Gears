/**
 * Things that change every frame: belt cargo, direction arrows, "no power" icons and night lights.
 * Drawn with one Graphics object over the chunk layer.
 */
import { Graphics } from "pixi.js";
import { bankSize, crafterRecipe, DIRS4, isLit, jobProgress, isPowered, poleLinks, sourceFactor, type Game } from "@wc/sim";
import { TILE } from "./textures.ts";

/** Overlay colors for power networks. */
const NET_COLORS = [0x4fc3f7, 0xffd54f, 0x81c784, 0xba68c8, 0xff8a65, 0x4db6ac, 0xf06292, 0xaed581];

export class DynamicRenderer {
  readonly gfx = new Graphics();
  /** Light glows: drawn above the night overlay in screen space by main.ts. */
  readonly lights = new Graphics();
  layer = 0;
  /** Power overlay: each network in its own color, machines without power outlined red. */
  powerOverlay = false;

  constructor(private game: Game) {
    this.lights.blendMode = "add";
  }

  /** How far each door is open (0..1), eased each frame. */
  private doorOpen = new Map<number, number>();
  private lastTime = 0;

  update(timeSec: number, view: { x: number; y: number; w: number; h: number }, darkness: number, toScreen: (x: number, y: number) => { x: number; y: number }, zoom: number) {
    const g = this.gfx, game = this.game;
    g.clear();
    this.lights.clear();
    const dt = Math.min(0.2, Math.max(0, timeSec - this.lastTime));
    this.lastTime = timeSec;
    // Who uses what right now: benches and desks being worked at, tiles walked on.
    const inUse = new Set<number>();
    const walked = new Set<string>();
    for (const p of game.pawns.values()) {
      if (p.layer !== this.layer) continue;
      walked.add(`${p.x},${p.y}`);
      const next = p.path?.[0];
      if (next && next.layer === p.layer && p.moveT > 0.4) walked.add(`${next.x},${next.y}`);
      const j = p.job;
      if (j?.targetId !== undefined && ((j.kind === "bill" && j.stage === 2) || (j.kind === "research" && j.stage >= 1))) inUse.add(j.targetId);
      // Work in progress (building, mining, cutting, crafting): a thin cream bar over the spot.
      const prog = jobProgress(game, p);
      if (prog && prog.at.layer === this.layer) progressBar(g, prog.at.x * TILE + 4, prog.at.y * TILE - 3, TILE - 8, prog.k);
    }
    for (const t of game.things.values()) {
      if (t.layer !== this.layer) continue;
      const px = t.x * TILE, py = t.y * TILE;
      if (px < view.x - TILE * 8 || py < view.y - TILE * 8 || px > view.x + view.w + TILE * 8 || py > view.y + view.h + TILE * 8) continue;
      const d = game.reg.things.list[t.def];
      // Power poles: a cable to each linked pole (drawn once per pair).
      if (d.pole)
        for (const o of poleLinks(game, t))
          if (o.id > t.id) g.moveTo(px + TILE / 2, py + 5).lineTo(o.x * TILE + TILE / 2, o.y * TILE + 5).stroke({ width: 1.5, color: 0x3a2e26, alpha: 0.85 });
      if (this.powerOverlay && (d.power || d.conduit)) {
        const net = game.netOf.get(t.id);
        const hue = net === undefined ? 0x777777 : NET_COLORS[net % NET_COLORS.length];
        for (const f of game.footprint(t.def, t.x, t.y, t.rot)) g.rect(f.x * TILE, f.y * TILE, TILE, TILE).fill({ color: hue, alpha: 0.35 });
        if (d.power?.use && !isPowered(game, t)) g.rect(px + 1, py + 1, TILE - 2, TILE - 2).stroke({ width: 2, color: 0xff4a3a });
      }
      const [fw, fh] = t.rot && t.rot % 2 ? [d.footprint[1], d.footprint[0]] : d.footprint;
      const cx = px + (fw * TILE) / 2, cy = py + (fh * TILE) / 2;
      const seed = t.id * 0.37;
      // Doors slide open while someone passes, then close again.
      if (d.door) {
        const want = walked.has(`${t.x},${t.y}`) ? 1 : 0;
        const o = (this.doorOpen.get(t.id) ?? 0) + (want - (this.doorOpen.get(t.id) ?? 0)) * Math.min(1, dt * 10);
        this.doorOpen.set(t.id, o);
        if (o > 0.02) {
          const col = parseInt(d.color.slice(1), 16);
          g.rect(px + 3, py + 3, TILE - 6, TILE - 6).fill({ color: 0x1b1714, alpha: 0.9 * o });
          const w = ((TILE - 6) / 2) * (1 - o);
          g.rect(px + 3, py + 3, w, TILE - 6).fill(col).rect(px + TILE - 3 - w, py + 3, w, TILE - 6).fill(col);
        }
      }
      // Benches in use: sparks at workbenches, smoke at fires and furnaces, a blinking screen at the desk.
      if (inUse.has(t.id)) {
        if (d.research) {
          if (Math.sin(timeSec * 6) > -0.2) g.rect(px + 7, py + 9, 7, 6).fill({ color: 0x9fd14a, alpha: 0.75 });
        } else if (d.id === "stove" || d.id === "campfire" || d.id === "smelter" || d.id === "fuel_still" || d.id === "refinery") this.puffs(g, cx, cy - 4, timeSec, seed, 0xd0d6dc);
        else if (d.water) this.drops(g, cx, cy, timeSec, seed);
        else this.sparks(g, cx, cy, timeSec, seed);
      }
      // Machines that run on their own.
      if (d.power?.fuel && (t.fuel ?? 0) > 0) this.puffs(g, px + fw * TILE - 6, py + 2, timeSec, seed, 0x56616d);
      if (d.autoCrafter && isPowered(game, t) && (t.work ?? 0) > 0) this.gear(g, cx, cy, timeSec * (d.crafterSpeed ?? 1) * 4);
      if (d.autoCrafter && (t.work ?? 0) > 0) {
        const r = crafterRecipe(game, t);
        if (r) progressBar(g, px + 4, py - 3, fw * TILE - 8, (t.work ?? 0) / r.work);
      }
      if (d.fluid?.role === "pump" && isPowered(game, t)) this.drops(g, cx, cy, timeSec, seed);
      if (d.robotBay && isPowered(game, t)) {
        const charging = [...game.pawns.values()].some((p) => p.job?.kind === "charge" && p.job.targetId === t.id && p.job.stage === 2);
        if (charging && Math.sin(timeSec * 5) > 0) g.rect(px + 4, py + 4, 4, 4).fill(0x9fd14a);
      }
      // A filled grave: an earth mound over the pit and a small wooden cross at its head.
      if (d.grave && t.filled) {
        g.roundRect(px + 9, py + 10, 14, 18, 5).fill(0x3a2e26).stroke({ width: 2, color: 0x1b1714 });
        g.roundRect(px + 11, py + 12, 10, 5, 2).fill(0x5c4636);
        g.rect(px + 14, py + 1, 4, 12).fill(0x1b1714).rect(px + 10, py + 3, 12, 4).fill(0x1b1714);
        g.rect(px + 15, py + 2, 2, 10).fill(0xd6ab6b).rect(px + 11, py + 4, 10, 2).fill(0xd6ab6b);
      }
      // Fuel bars for generators and fires.
      const fuel = d.power?.fuel ?? d.burns;
      if (fuel) chargeBar(g, px + 4, py + 2, fw * TILE - 8, 4, (t.fuel ?? 0) / fuel.capacity);
      // Charge bars: batteries, the robot bay and every machine's backup battery, red to yellow to green.
      if (d.power?.store) chargeBar(g, px + 4, py + fh * TILE - 7, fw * TILE - 8, 4, (t.charge ?? 0) / d.power.store);
      const bank = bankSize(game, t);
      if (bank > 0) {
        // Big banks (the robot bay) get a full bar; a small backup battery gets a thin one in the corner.
        if (bank >= 1000) chargeBar(g, px + 4, py + fh * TILE - 7, fw * TILE - 8, 4, (t.bank ?? 0) / bank);
        else chargeBar(g, px + fw * TILE - 11, py + fh * TILE - 5, 8, 3, (t.bank ?? 0) / bank);
      }
      // Wind turbines: blades turn with the wind.
      if (d.power?.source === "wind") {
        const a = timeSec * (1 + 4 * sourceFactor(game, t, "wind"));
        for (let k = 0; k < 3; k++) {
          const ang = a + (k * Math.PI * 2) / 3;
          g.moveTo(cx, cy).lineTo(cx + Math.cos(ang) * TILE * 0.85, cy + Math.sin(ang) * TILE * 0.85).stroke({ width: 5, color: 0x1b1714 });
          g.moveTo(cx, cy).lineTo(cx + Math.cos(ang) * TILE * 0.8, cy + Math.sin(ang) * TILE * 0.8).stroke({ width: 3, color: 0xd0d6dc });
        }
        g.circle(cx, cy, 4).fill(0x6f8088).stroke({ width: 1, color: 0x1b1714 });
      }
      // Belts: ribs run along the belt while it has power, at the cargo's speed.
      if (d.belt && isPowered(game, t)) {
        const [dx, dy] = DIRS4[t.rot ?? 0];
        const off = (timeSec * 64) % 8;
        for (let k = 0; k < 4; k++) {
          const u = k * 8 + off - 16; // along the belt, from the tile center
          const cxr = px + TILE / 2 + dx * u, cyr = py + TILE / 2 + dy * u;
          // Across the belt: perpendicular to the direction, 16 units wide.
          g.moveTo(cxr - dy * 8, cyr - dx * 8).lineTo(cxr + dy * 8, cyr + dx * 8).stroke({ width: 2, color: 0x1b1714, alpha: 0.5 });
        }
      }
      // Loaders and arms: a small pointer at the front edge, in the palette's rust brown.
      if (d.rotatable && !d.belt) {
        const [dx, dy] = DIRS4[t.rot ?? 0];
        const fx = px + TILE / 2 + dx * 13, fy = py + TILE / 2 + dy * 13;
        g.poly([fx + dx * 3, fy + dy * 3, fx - dx * 2 - dy * 4, fy - dy * 2 + dx * 4, fx - dx * 2 + dy * 4, fy - dy * 2 - dx * 4])
          .fill(0xb0834e)
          .stroke({ width: 1, color: 0x1b1714 });
      }
      // Belt cargo: a small crate in the item's color sliding along.
      if (d.belt && t.cargo) {
        const [dx, dy] = DIRS4[t.rot ?? 0];
        const off = (t.cargo.progress - 0.5) * TILE;
        const cx2 = px + TILE / 2 + dx * off, cy2 = py + TILE / 2 + dy * off;
        const col = parseInt(game.reg.items.list[t.cargo.def].color.slice(1), 16);
        g.rect(cx2 - 5, cy2 - 5, 10, 10).fill(col).stroke({ width: 2, color: 0x1b1714 });
        g.rect(cx2 - 3, cy2 - 3, 4, 2).fill({ color: 0xffffff, alpha: 0.35 });
      }
      // Missing power: a red bolt that blinks.
      if (d.power?.use && !isPowered(game, t) && Math.sin(timeSec * 5) > 0) {
        const cx = px + TILE - 9, cy = py + 3;
        g.poly([cx + 4, cy, cx, cy + 7, cx + 3, cy + 7, cx + 1, cy + 13, cx + 7, cy + 5, cx + 4, cy + 5]).fill(0xff4a3a);
      }
      // Light: lamps when powered, fires always. Only drawn at night.
      if (d.light && darkness > 0.05 && isPowered(game, t) && isLit(game, t)) {
        const s = toScreen((t.x + 0.5) * TILE, (t.y + 0.5) * TILE);
        const r = d.light * TILE * zoom;
        const flick = d.id === "campfire" ? 0.9 + 0.1 * Math.sin(timeSec * 9 + t.id) : 1;
        for (let k = 10; k >= 1; k--) this.lights.circle(s.x, s.y, (r * k) / 10).fill({ color: 0xffb060, alpha: 0.028 * darkness * flick });
      }
    }
  }

  /** Smoke or steam: three puffs rising and fading. */
  private puffs(g: Graphics, x: number, y: number, t: number, seed: number, color: number) {
    for (let k = 0; k < 3; k++) {
      const ph = (t * 0.7 + k / 3 + seed) % 1;
      g.circle(x + Math.sin(ph * 6 + seed) * 3, y - ph * 18, 2 + ph * 3).fill({ color, alpha: 0.55 * (1 - ph) });
    }
  }

  /** Work sparks: a few bright pixels that flash. */
  private sparks(g: Graphics, x: number, y: number, t: number, seed: number) {
    for (let k = 0; k < 4; k++) {
      if (Math.sin(t * 17 + k * 1.9 + seed * 7) < 0.55) continue;
      const ox = Math.sin(k * 12.9 + seed + Math.floor(t * 4)) * 8, oy = Math.cos(k * 7.3 + seed + Math.floor(t * 4)) * 6;
      g.rect(x + ox, y + oy - 4, 2, 2).fill(k % 2 ? 0xffd27a : 0xffffff);
    }
  }

  /** Water: drops falling and a ring spreading. */
  private drops(g: Graphics, x: number, y: number, t: number, seed: number) {
    const ph = (t * 1.2 + seed) % 1;
    g.circle(x, y, 2 + ph * 7).stroke({ width: 1, color: 0x9ec9e8, alpha: 1 - ph });
    g.rect(x - 1, y - 10 + ph * 8, 2, 3).fill({ color: 0x9ec9e8, alpha: 1 - ph });
  }

  /** A turning gear mark for machines at work. */
  private gear(g: Graphics, x: number, y: number, a: number) {
    for (let k = 0; k < 4; k++) {
      const ang = a + (k * Math.PI) / 2;
      g.moveTo(x, y).lineTo(x + Math.cos(ang) * 6, y + Math.sin(ang) * 6).stroke({ width: 2, color: 0xe3c25a });
    }
    g.circle(x, y, 2).fill(0x1b1714);
  }
}

/** Charge color: red when low, yellow in the middle, green when full (palette tones). */
export function chargeColor(k: number): number {
  return k < 0.25 ? 0xd9472e : k < 0.6 ? 0xe3c25a : 0x9fd14a;
}

/** A work progress bar: cream on a dark frame; `k` is 0..1. */
export function progressBar(g: Graphics, x: number, y: number, w: number, k: number): void {
  k = Math.max(0, Math.min(1, k));
  g.rect(x, y, w, 4).fill({ color: 0x1b1714, alpha: 0.85 });
  if (k > 0) g.rect(x + 1, y + 1, Math.max(1, (w - 2) * k), 2).fill(0xefd8a4);
}

/** A charge bar with a dark frame; `k` is 0..1. */
export function chargeBar(g: Graphics, x: number, y: number, w: number, h: number, k: number): void {
  k = Math.max(0, Math.min(1, k));
  g.rect(x, y, w, h).fill(0x1b1714);
  if (k > 0) g.rect(x + 1, y + 1, Math.max(1, (w - 2) * k), h - 2).fill(chargeColor(k));
}
