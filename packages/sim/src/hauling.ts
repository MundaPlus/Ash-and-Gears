/**
 * Carrying and stockpiles (spec 03, "Zones"). A pawn carries one stack at a time.
 * The haul work giver moves loose items into stockpile zones that accept them.
 * A haul list keeps every loose stack that has a place to go, with its distance to the nearest
 * storage. Stacks the player marked "haul now" go first; then the closest to storage; far stacks wait.
 */
import { atGoal, goTo, isReserved, reserve } from "./ai.ts";
import { registerJob, registerWorkGiver } from "./jobs.ts";
import type { Game } from "./game.ts";
import { canHoldItem, chestCount, dropItems, putInChest, stackLimit, takeFromStack } from "./items.ts";
import { NO_THING, type ItemStack, type Zone } from "./map.ts";
import type { Pos } from "./path.ts";
import type { Job, Pawn } from "./pawn.ts";

export const ALL_CATEGORIES = ["resource", "food", "water", "medicine", "weapon", "apparel", "blueprint", "misc"];

/** Pick up to `max` items from a ground stack into the pawn's hands. */
export function pickUp(game: Game, p: Pawn, stackId: number, max: number): number {
  const s = game.items.get(stackId);
  if (!s) return 0;
  if (p.carrying && (p.carrying.def !== s.def || !!p.carrying.contaminated !== !!s.contaminated)) return 0;
  const room = stackLimit(game, s.def) - (p.carrying?.count ?? 0);
  const contaminated = !!s.contaminated;
  const def = s.def;
  const n = takeFromStack(game, stackId, Math.min(max, room));
  if (n <= 0) return 0;
  if (p.carrying) p.carrying.count += n;
  else p.carrying = { id: game.newId(), def, count: n, layer: -1, x: 0, y: 0, ...(contaminated ? { contaminated } : {}) };
  return n;
}

/** Put down everything the pawn carries at its feet (or nearby). */
export function dropCarried(game: Game, p: Pawn): void {
  if (!p.carrying) return;
  dropItems(game, p.carrying.def, p.carrying.count, p.layer, p.x, p.y, !!p.carrying.contaminated);
  p.carrying = null;
}

// ---------------------------------------------------------------- zones

export function createZone(
  game: Game,
  kind: Zone["kind"],
  layer: number,
  tiles: { x: number; y: number }[],
  allow = ALL_CATEGORIES,
  crop?: string,
): Zone {
  const z: Zone = { id: game.newId(), kind, layer, allow: kind === "stockpile" ? [...allow] : [], ...(crop ? { crop } : {}) };
  game.zones.set(z.id, z);
  addToZone(game, z.id, tiles);
  return z;
}

/** Add tiles to a zone. Skips solid tiles and tiles in another zone. */
export function addToZone(game: Game, zoneId: number, tiles: { x: number; y: number }[]): number {
  const z = game.zones.get(zoneId)!;
  const L = game.map.layers[z.layer];
  let n = 0;
  for (const { x, y } of tiles) {
    if (!L.inBounds(x, y)) continue;
    const i = L.i(x, y);
    if (L.zone[i] !== NO_THING || game.reg.terrain.list[L.terrain[i]].solid) continue;
    if (z.kind === "grow" && game.reg.terrain.list[L.terrain[i]].fertility <= 0) continue;
    L.zone[i] = z.id;
    L.touch(x, y);
    n++;
  }
  game.mapVersion++;
  return n;
}

export function removeZoneTiles(game: Game, layer: number, tiles: { x: number; y: number }[]): void {
  const L = game.map.layers[layer];
  for (const { x, y } of tiles) {
    if (!L.inBounds(x, y)) continue;
    const i = L.i(x, y);
    if (L.zone[i] === NO_THING) continue;
    L.zone[i] = NO_THING;
    L.touch(x, y);
  }
  // Drop zones with no tiles left.
  const used = new Set<number>();
  for (const Lx of game.map.layers) for (const z of Lx.zone) if (z !== NO_THING) used.add(z);
  for (const id of [...game.zones.keys()]) if (!used.has(id)) game.zones.delete(id);
  game.mapVersion++;
}

function zoneAt(game: Game, layer: number, x: number, y: number): Zone | null {
  const L = game.map.layers[layer];
  const z = L.zone[L.i(x, y)];
  return z === NO_THING ? null : (game.zones.get(z) ?? null);
}

function accepts(game: Game, z: Zone | null, def: number, contaminated: boolean): boolean {
  if (!z || z.kind !== "stockpile") return false;
  void contaminated;
  return z.allow.includes(game.reg.items.list[def].category);
}

/** Nearest stockpile tile or chest with room that can take this item. */
function findStorage(game: Game, p: Pawn, from: Pos, def: number, contaminated: boolean): Pos | null {
  let best: Pos | null = null, bestD = Infinity;
  // Chests take anything while they have room.
  for (const t of game.things.values()) {
    const cap = game.reg.things.list[t.def].chest;
    if (!cap || chestCount(game, t) >= cap || isReserved(game, `tile:${t.layer},${t.x},${t.y}`, p)) continue;
    const d = (t.x - from.x) ** 2 + (t.y - from.y) ** 2 + (t.layer !== from.layer ? 900 : 0);
    if (d < bestD) {
      best = { layer: t.layer, x: t.x, y: t.y };
      bestD = d;
    }
  }
  for (const z of game.zones.values()) {
    if (!accepts(game, z, def, contaminated)) continue;
    const L = game.map.layers[z.layer];
    for (let i = 0; i < L.zone.length; i++) {
      if (L.zone[i] !== z.id) continue;
      const x = i % L.w, y = Math.floor(i / L.w);
      const d = (x - from.x) ** 2 + (y - from.y) ** 2 + (z.layer !== from.layer ? 900 : 0);
      if (d >= bestD) continue;
      if (!canHoldItem(game, z.layer, x, y, def, contaminated)) continue;
      if (isReserved(game, `tile:${z.layer},${x},${y}`, p)) continue;
      best = { layer: z.layer, x, y };
      bestD = d;
    }
  }
  return best && game.path.canReach(from, best) ? best : null;
}

/** Items stored in stockpiles and chests (the top bar counts only these, not loose items on the map). */
export function storedCount(game: Game, defId: string): number {
  const def = game.reg.items.idx(defId);
  let n = 0;
  for (const s of game.items.values()) {
    if (s.def !== def || s.layer < 0) continue;
    if (s.chest !== undefined || zoneAt(game, s.layer, s.x, s.y)?.kind === "stockpile") n += s.count;
  }
  return n;
}

// ---------------------------------------------------------------- haul list

export interface HaulEntry {
  /** Item stack id. */
  id: number;
  /** Tiles to the nearest storage that takes it (straight line; another layer adds 30). */
  dist: number;
  urgent: boolean;
}

/** Rebuilt at most this often (ticks), or at once when the player marks a stack. */
const HAUL_LIST_EVERY = 60;
const haulCache = new WeakMap<Game, { at: number; list: HaulEntry[] }>();

/** Loose stacks: not in a chest, not on a stockpile that takes them, not forbidden. */
function isLoose(game: Game, s: ItemStack): boolean {
  return s.layer >= 0 && s.chest === undefined && !s.forbidden && !accepts(game, zoneAt(game, s.layer, s.x, s.y), s.def, !!s.contaminated);
}

/** What needs hauling, best first: urgent stacks, then the ones closest to storage. Internal (not shown to players). */
export function haulList(game: Game): HaulEntry[] {
  const c = haulCache.get(game);
  if (c && game.tick - c.at < HAUL_LIST_EVERY) return c.list;
  // Storage spots: chests with room take anything; stockpile tiles take their categories.
  const chests: Pos[] = [];
  for (const t of game.things.values()) {
    const cap = game.reg.things.list[t.def].chest;
    if (cap && chestCount(game, t) < cap) chests.push({ layer: t.layer, x: t.x, y: t.y });
  }
  const tilesByCat = new Map<string, Pos[]>();
  for (const z of game.zones.values()) {
    if (z.kind !== "stockpile") continue;
    const L = game.map.layers[z.layer];
    const tiles: Pos[] = [];
    for (let i = 0; i < L.zone.length; i++) if (L.zone[i] === z.id) tiles.push({ layer: z.layer, x: i % L.w, y: Math.floor(i / L.w) });
    for (const cat of z.allow) tilesByCat.set(cat, [...(tilesByCat.get(cat) ?? []), ...tiles]);
  }
  const list: HaulEntry[] = [];
  if (chests.length || tilesByCat.size)
    for (const s of game.items.values()) {
      if (!isLoose(game, s)) continue;
      let best = Infinity;
      for (const q of [...chests, ...(tilesByCat.get(game.reg.items.list[s.def].category) ?? [])]) {
        const d = Math.hypot(q.x - s.x, q.y - s.y) + (q.layer !== s.layer ? 30 : 0);
        if (d < best) best = d;
      }
      if (best < Infinity) list.push({ id: s.id, dist: best, urgent: !!s.haulNow });
    }
  list.sort((a, b) => Number(b.urgent) - Number(a.urgent) || a.dist - b.dist || a.id - b.id);
  haulCache.set(game, { at: game.tick, list });
  return list;
}

/** Mark a stack "haul now" (tile action). Returns false when it cannot be hauled anywhere. */
export function haulNow(game: Game, stackId: number): boolean {
  const s = game.items.get(stackId);
  if (!s || !isLoose(game, s)) return false;
  s.haulNow = true;
  haulCache.delete(game);
  return true;
}

/** Can this stack go on the haul list (loose, and some storage takes it)? */
export function canHaul(game: Game, stackId: number): boolean {
  const s = game.items.get(stackId);
  if (!s || !isLoose(game, s) || s.haulNow) return false;
  // Some chest with room, or some stockpile that takes the category (the haul list may be a few ticks old).
  const cat = game.reg.items.list[s.def].category;
  if ([...game.zones.values()].some((z) => z.kind === "stockpile" && z.allow.includes(cat))) return true;
  return [...game.things.values()].some((t) => {
    const cap = game.reg.things.list[t.def].chest;
    return !!cap && chestCount(game, t) < cap;
  });
}

/** A haul job from the list. `urgentOnly`: only stacks the player marked. */
export function haulJob(game: Game, p: Pawn, urgentOnly: boolean): Job | null {
  let tries = 0;
  for (const e of haulList(game)) {
    if (urgentOnly && !e.urgent) break;
    const s = game.items.get(e.id);
    if (!s || !isLoose(game, s) || isReserved(game, `item:${s.id}`, p)) continue;
    // Among stacks at about the same distance from storage, prefer the ones near the hauler.
    if (tries++ > 12) break;
    if (!game.path.canReach(p, s)) continue;
    const dest = findStorage(game, p, s, s.def, !!s.contaminated);
    if (!dest) continue;
    if (!reserve(game, `item:${s.id}`, p)) continue;
    if (!reserve(game, `tile:${dest.layer},${dest.x},${dest.y}`, p)) {
      game.reservations.delete(`item:${s.id}`);
      continue;
    }
    return { kind: "haul", stage: 0, targetId: s.id, target: dest };
  }
  return null;
}

// ---------------------------------------------------------------- haul job

registerWorkGiver({
  workType: "haul",
  give(game, p) {
    return haulJob(game, p, false);
  },
});

registerJob("haul", (game, p, job: Job) => {
  if (job.stage === 0) {
    const s = game.items.get(job.targetId!);
    if (!s || !goTo(game, p, s)) return "fail";
    job.stage = 1;
  }
  if (job.stage === 1) {
    if (!atGoal(p)) return "run";
    if (pickUp(game, p, job.targetId!, Infinity) <= 0) return "fail";
    if (!goTo(game, p, job.target!)) return "fail";
    job.stage = 2;
  }
  if (!atGoal(p)) return "run";
  // Into a chest when the target is one; what does not fit goes on the ground.
  const L = game.map.layers[job.target!.layer];
  const tid = L.thing[L.i(job.target!.x, job.target!.y)];
  const chest = tid !== NO_THING && game.reg.things.list[game.things.get(tid)!.def].chest ? game.things.get(tid)! : null;
  if (chest && p.carrying) {
    p.carrying.count -= putInChest(game, chest, p.carrying.def, p.carrying.count, !!p.carrying.contaminated, p.carrying.contamUntil);
    if (p.carrying.count <= 0) p.carrying = null;
  }
  dropCarried(game, p);
  return "done";
});
