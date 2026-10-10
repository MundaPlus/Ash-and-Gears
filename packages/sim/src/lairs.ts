/**
 * Lairs (N1): sealed rooms in towers and in the old bunker, with enemies that sleep inside until they
 * are disturbed: the door is pried open, one of them gets hurt, or a survivor comes close and in sight.
 * Lair enemies never leave. They guard their room and hunt survivors on their own floor.
 */
import { attack, canSee, dist, inAttackRange } from "./combat.ts";
import { goTo } from "./ai.ts";
import type { Game } from "./game.ts";
import { makeHostile, type Pawn } from "./pawn.ts";
import type { Rng } from "./rng.ts";

export type LairKind = "rats" | "hounds" | "bots";

/** Who sleeps in each kind of lair: creature, how many (min, max). */
const LAIRS: Record<LairKind, [string, number, number][]> = {
  rats: [["rad_rat", 5, 8]],
  hounds: [["glow_hound", 2, 3]],
  bots: [["rogue_bot", 1, 2], ["old_sentry", 1, 1]],
};
export const LAIR_KINDS = Object.keys(LAIRS) as LairKind[];

/** How close (tiles, in sight) a survivor may come before a lair wakes. */
const WAKE_RANGE = 5;
/** How far awake lair enemies hunt from their room. */
const HUNT_RANGE = 30;

export interface LairRect {
  layer: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Fill a room (inside tiles, inclusive) with a sleeping lair. Returns the group id. */
export function makeLair(game: Game, r: LairRect, kind: LairKind, rng: Rng): number {
  const id = game.newId();
  const free: { x: number; y: number }[] = [];
  const L = game.map.layers[r.layer];
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) if (game.walkable(r.layer, x, y) && L.thing[L.i(x, y)] === -1) free.push({ x, y });
  let size = 0;
  for (const [creature, lo, hi] of LAIRS[kind]) {
    for (let n = rng.int(lo, hi); n > 0 && free.length; n--) {
      const at = free.splice(rng.int(0, free.length - 1), 1)[0];
      const p = makeHostile(game, creature, "wild", r.layer, at.x, at.y, id, null);
      game.pawns.set(p.id, p);
      size++;
    }
  }
  game.groups.set(id, { id, kind: "lair", size, fleeing: false, arrived: game.tick, dormant: true, lair: { ...r } });
  return id;
}

export function isDormant(game: Game, p: Pawn): boolean {
  return p.group !== null && !!game.groups.get(p.group)?.dormant;
}

function wake(game: Game, gid: number, at?: { layer: number; x: number; y: number }) {
  const g = game.groups.get(gid);
  if (!g?.dormant) return;
  g.dormant = false;
  game.message("msg.lair_woke", {}, "bad", at ?? (g.lair ? { layer: g.lair.layer, x: g.lair.x0, y: g.lair.y0 } : undefined));
}

/** A door at (x, y) opened: wake every lair whose room touches it. */
export function wakeLairs(game: Game, layer: number, x: number, y: number): void {
  for (const g of game.groups.values()) {
    const r = g.lair;
    if (!r || r.layer !== layer) continue;
    if (x >= r.x0 - 1 && x <= r.x1 + 1 && y >= r.y0 - 1 && y <= r.y1 + 1) wake(game, g.id, { layer, x, y });
  }
}

/** Every few ticks: sleeping lairs wake when one of them is hurt or a survivor is close and in sight. */
export function tickLairs(game: Game): void {
  if (game.tick % 20 !== 0) return;
  for (const g of game.groups.values()) {
    if (!g.dormant) continue;
    for (const p of game.pawns.values()) {
      if (p.group !== g.id) continue;
      const hurt = p.health.injuries.length > 0;
      const seen = [...game.pawns.values()].some(
        (o) => o.faction === "colony" && o.layer === p.layer && dist(o, p) <= WAKE_RANGE && canSee(game, p.layer, p, o),
      );
      if (hurt || seen) {
        wake(game, g.id, p);
        break;
      }
    }
  }
}

/** One think of a lair enemy. True when handled (the normal hostile AI then does nothing). */
export function lairTick(game: Game, p: Pawn): boolean {
  const g = p.group !== null ? game.groups.get(p.group) : undefined;
  if (g?.kind !== "lair") return false;
  if (g.dormant) {
    p.path = null;
    return true;
  }
  const still = game.reg.content.creatures[p.creature].speed === 0;
  // The nearest survivor on this floor, not too far from the room.
  let target: Pawn | null = null, best = Infinity;
  for (const o of game.pawns.values()) {
    if (o.faction !== "colony" || o.health.downed || o.layer !== p.layer) continue;
    const d = dist(p, o);
    if (d > HUNT_RANGE || d >= best) continue;
    if (still ? !inAttackRange(game, p, o) : !game.path.canReach(p, o)) continue;
    best = d;
    target = o;
  }
  if (target && inAttackRange(game, p, target)) {
    p.path = null;
    attack(game, p, target);
    return true;
  }
  if (still) return true;
  if (target) {
    if (!p.path?.length || (game.tick + p.id) % 30 === 0) goTo(game, p, target, true);
    return true;
  }
  // Nobody to fight: back into the room.
  const r = g.lair!;
  const inside = p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1;
  if (!inside && !p.path?.length) goTo(game, p, { layer: r.layer, x: (r.x0 + r.x1) >> 1, y: (r.y0 + r.y1) >> 1 }, true);
  return true;
}
