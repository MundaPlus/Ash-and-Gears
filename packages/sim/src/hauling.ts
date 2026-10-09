/**
 * Carrying and stockpiles (spec 03, "Zones"). A pawn carries one stack at a time.
 * The haul work giver moves loose items into stockpile zones that accept them.
 */
import { atGoal, findItem, goTo, isReserved, registerJob, registerWorkGiver, reserve } from "./ai.ts";
import type { Game } from "./game.ts";
import { canHoldItem, dropItems, stackLimit, takeFromStack } from "./items.ts";
import { NO_THING, type Zone } from "./map.ts";
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

export function createZone(game: Game, kind: Zone["kind"], layer: number, tiles: { x: number; y: number }[], allow = ALL_CATEGORIES): Zone {
  const z: Zone = { id: game.newId(), kind, layer, allow: [...allow] };
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
  // Contaminated goods never go into normal stockpiles (spec 04); M4 adds a dump for them.
  if (contaminated) return false;
  return z.allow.includes(game.reg.items.list[def].category);
}

/** Nearest stockpile tile that can take this item. */
function findStorage(game: Game, p: Pawn, from: Pos, def: number, contaminated: boolean): Pos | null {
  let best: Pos | null = null, bestD = Infinity;
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

// ---------------------------------------------------------------- haul job

registerWorkGiver({
  workType: "haul",
  give(game, p) {
    if (!game.zones.size) return null;
    const stack = findItem(game, p, () => true, (s) => !accepts(game, zoneAt(game, s.layer, s.x, s.y), s.def, !!s.contaminated));
    if (stack === null) return null;
    const s = game.items.get(stack)!;
    const dest = findStorage(game, p, s, s.def, !!s.contaminated);
    if (!dest) return null;
    if (!reserve(game, `item:${stack}`, p)) return null;
    if (!reserve(game, `tile:${dest.layer},${dest.x},${dest.y}`, p)) {
      game.reservations.delete(`item:${stack}`);
      return null;
    }
    return { kind: "haul", stage: 0, targetId: stack, target: dest };
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
  dropCarried(game, p);
  return "done";
});
