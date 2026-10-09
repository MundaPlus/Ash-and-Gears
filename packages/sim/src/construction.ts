/**
 * Construction (spec 03): blueprints, material delivery and building.
 * The player places a blueprint. Survivors bring the materials (several blueprints per trip when
 * they are close together), then one survivor builds it.
 */
import { atGoal, findItem, goTo, isReserved, reserve } from "./ai.ts";
import { registerJob, registerWorkGiver } from "./jobs.ts";
import type { Game } from "./game.ts";
import { dropItems, takeFromStack } from "./items.ts";
import { NO_THING, type Blueprint } from "./map.ts";
import { dropCarried, pickUp } from "./hauling.ts";
import type { Pawn } from "./pawn.ts";
import { setRoof } from "./rooms.ts";
import { registerTask, workJob } from "./work.ts";

/** Blueprints within this many tiles share one delivery trip. */
const BATCH_RADIUS = 10;

function buildInfo(game: Game, kind: Blueprint["kind"], def: number) {
  return kind === "thing" ? game.reg.things.list[def].build : game.reg.floors.list[def].build;
}

/** Can a blueprint of this def go on this tile? */
export function canPlace(game: Game, kind: Blueprint["kind"], defId: string, layer: number, x: number, y: number): boolean {
  const L = game.map.layers[layer];
  if (!L.inBounds(x, y)) return false;
  const i = L.i(x, y);
  const td = game.reg.terrain.list[L.terrain[i]];
  if (td.solid || !td.buildable) return false;
  // A new blueprint may replace a different one on the same tile (a door over a wall plan).
  const old = L.blueprint[i] !== NO_THING ? game.blueprints.get(L.blueprint[i]) : undefined;
  if (old && old.kind === kind && (kind === "floor" ? game.reg.floors.list[old.def].id : game.reg.things.list[old.def].id) === defId) return false;
  if (old && old.kind !== kind) return false;
  if (kind === "floor") return L.floor[i] === 0;
  const build = game.reg.things.get(defId).build;
  if (!build || (build.research && !game.research.done.has(build.research))) return false;
  return L.thing[i] === NO_THING;
}

export function placeBlueprint(game: Game, kind: Blueprint["kind"], defId: string, layer: number, x: number, y: number, rot?: number): Blueprint | null {
  if (!canPlace(game, kind, defId, layer, x, y)) return null;
  const Lr = game.map.layers[layer];
  const replaced = Lr.blueprint[Lr.i(x, y)];
  if (replaced !== NO_THING) cancelBlueprint(game, replaced);
  const def = kind === "thing" ? game.reg.things.idx(defId) : game.reg.floors.idx(defId);
  const info = buildInfo(game, kind, def)!;
  const need: Record<number, number> = {};
  for (const [item, n] of Object.entries(info.cost)) need[game.reg.items.idx(item)] = n;
  const bp: Blueprint = { id: game.newId(), kind, def, layer, x, y, need, work: info.work, ...(rot !== undefined ? { rot } : {}) };
  game.blueprints.set(bp.id, bp);
  const L = game.map.layers[layer];
  L.blueprint[L.i(x, y)] = bp.id;
  L.touch(x, y);
  game.mapVersion++;
  return bp;
}

/** Remove a blueprint and give back what was already delivered. */
export function cancelBlueprint(game: Game, id: number): void {
  const bp = game.blueprints.get(id);
  if (!bp) return;
  const info = buildInfo(game, bp.kind, bp.def)!;
  for (const [item, n] of Object.entries(info.cost)) {
    const delivered = n - (bp.need[game.reg.items.idx(item)] ?? 0);
    if (delivered > 0) dropItems(game, item, delivered, bp.layer, bp.x, bp.y);
  }
  removeBlueprint(game, bp);
}

function removeBlueprint(game: Game, bp: Blueprint) {
  game.blueprints.delete(bp.id);
  game.progress.delete(`build:${bp.layer},${bp.x},${bp.y}`);
  const L = game.map.layers[bp.layer];
  L.blueprint[L.i(bp.x, bp.y)] = NO_THING;
  L.touch(bp.x, bp.y);
  game.mapVersion++;
}

const needsMaterials = (bp: Blueprint) => Object.values(bp.need).some((n) => n > 0);

/** Finish a blueprint: place the thing or floor. Push pawns and items off blocking things. */
function completeBlueprint(game: Game, bp: Blueprint) {
  removeBlueprint(game, bp);
  const L = game.map.layers[bp.layer];
  const i = L.i(bp.x, bp.y);
  if (bp.kind === "floor") {
    L.floor[i] = bp.def + 1;
    L.touch(bp.x, bp.y);
    game.mapVersion++;
    game.pathVersion++;
    return;
  }
  const def = game.reg.things.list[bp.def];
  let moved: { def: number; count: number; contaminated: boolean } | null = null;
  if (def.blocks && L.item[i] !== NO_THING) {
    const s = game.items.get(L.item[i])!;
    moved = { def: s.def, count: s.count, contaminated: !!s.contaminated };
    takeFromStack(game, s.id, s.count);
  }
  game.spawnThing(def.id, bp.layer, bp.x, bp.y, bp.rot);
  if (moved) dropItems(game, moved.def, moved.count, bp.layer, bp.x, bp.y, moved.contaminated);
  if (def.blocks) {
    for (const p of game.pawns.values()) {
      if (p.layer !== bp.layer || p.x !== bp.x || p.y !== bp.y) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        if (game.walkable(bp.layer, bp.x + dx, bp.y + dy)) {
          p.x += dx;
          p.y += dy;
          p.path = null;
          break;
        }
      }
    }
  }
}

registerTask("build", {
  skill: "construction",
  xp: 0.5,
  total: (game, job) => game.blueprints.get(job.targetId!)?.work ?? 1,
  valid: (game, job) => {
    const bp = game.blueprints.get(job.targetId!);
    return !!bp && !needsMaterials(bp);
  },
  complete: (game, _p, job) => completeBlueprint(game, game.blueprints.get(job.targetId!)!),
});

// ---------------------------------------------------------------- work giver

function nearestBlueprints(game: Game, p: Pawn, filter: (bp: Blueprint) => boolean): Blueprint[] {
  return [...game.blueprints.values()]
    .filter((bp) => filter(bp) && !isReserved(game, `bp:${bp.id}`, p) && !isReserved(game, `tile:${bp.layer},${bp.x},${bp.y}`, p))
    .sort((a, b) => (a.x - p.x) ** 2 + (a.y - p.y) ** 2 + (a.layer !== p.layer ? 900 : 0) - ((b.x - p.x) ** 2 + (b.y - p.y) ** 2 + (b.layer !== p.layer ? 900 : 0)));
}

registerWorkGiver({
  workType: "construct",
  give(game, p) {
    if (!game.blueprints.size) return null;
    // 1. Build anything that has all its materials.
    for (const bp of nearestBlueprints(game, p, (b) => !needsMaterials(b)).slice(0, 10)) {
      if (!game.path.canReachAdjacent(p, bp)) continue;
      const job = workJob(game, p, "build", bp, bp.id);
      if (job) return job;
    }
    // 2. Bring materials to the nearest blueprint that needs them.
    for (const bp of nearestBlueprints(game, p, needsMaterials).slice(0, 10)) {
      if (!game.path.canReachAdjacent(p, bp)) continue;
      for (const [itemIdx, n] of Object.entries(bp.need)) {
        if (n <= 0) continue;
        const def = Number(itemIdx);
        const stack = findItem(game, p, (d, cont) => d === def && !cont);
        if (stack === null) continue;
        if (!reserve(game, `item:${stack}`, p)) continue;
        if (!reserve(game, `bp:${bp.id}`, p)) {
          game.reservations.delete(`item:${stack}`);
          continue;
        }
        return { kind: "deliver", stage: 0, targetId: stack, data: { bp: bp.id, item: def } };
      }
    }
    return null;
  },
});

/** Total still needed of `item` by `first` and other free blueprints near it. */
function batchNeed(game: Game, p: Pawn, first: Blueprint, item: number): number {
  let total = 0;
  for (const bp of game.blueprints.values()) {
    if (bp.layer !== first.layer || Math.abs(bp.x - first.x) + Math.abs(bp.y - first.y) > BATCH_RADIUS) continue;
    if (bp.id !== first.id && isReserved(game, `bp:${bp.id}`, p)) continue;
    total += bp.need[item] ?? 0;
  }
  return total;
}

registerJob("deliver", (game, p, job) => {
  const item = job.data!.item as number;
  let bp = game.blueprints.get(job.data!.bp as number);
  if (!bp) return p.carrying ? (dropCarried(game, p), "done") : "fail";
  if (job.stage === 0) {
    const s = game.items.get(job.targetId!);
    if (!s || !goTo(game, p, s)) return "fail";
    job.stage = 1;
  }
  if (job.stage === 1) {
    if (!atGoal(p)) return "run";
    if (pickUp(game, p, job.targetId!, batchNeed(game, p, bp, item)) <= 0) return "fail";
    job.stage = 2;
  }
  if (job.stage === 2) {
    if (!goTo(game, p, bp, true)) return "fail";
    job.stage = 3;
  }
  if (!atGoal(p)) return "run";
  // Deposit into this blueprint, then walk on to the next one nearby that needs the same item.
  const give = Math.min(p.carrying?.count ?? 0, bp.need[item] ?? 0);
  bp.need[item] -= give;
  if (p.carrying) {
    p.carrying.count -= give;
    if (p.carrying.count <= 0) p.carrying = null;
  }
  if (!p.carrying) return "done";
  bp = nearestBlueprints(game, p, (b) => b.layer === p.layer && (b.need[item] ?? 0) > 0)[0];
  if (!bp || Math.abs(bp.x - p.x) + Math.abs(bp.y - p.y) > BATCH_RADIUS * 2 || !reserve(game, `bp:${bp.id}`, p)) {
    dropCarried(game, p);
    return "done";
  }
  job.data!.bp = bp.id;
  job.stage = 2;
  return "run";
});

// ---------------------------------------------------------------- material warnings

/** Last warning tick per game and item, so each shortage is told once a day. */
const warned = new WeakMap<Game, Map<number, number>>();

/** Every two hours: tell the player when plans wait for a material the colony does not have. */
export function tickConstruction(game: Game): void {
  if (!game.blueprints.size || game.tick % Math.round(game.ticksPerHour * 2) !== 0) return;
  const short = new Set<number>();
  for (const bp of game.blueprints.values()) for (const [k, n] of Object.entries(bp.need)) if (n > 0) short.add(Number(k));
  let last = warned.get(game);
  if (!last) warned.set(game, (last = new Map()));
  for (const def of short) {
    let have = 0;
    for (const s of game.items.values()) if (s.def === def && s.layer >= 0) have += s.count;
    for (const p of game.pawns.values()) if (p.carrying?.def === def) have += p.carrying.count;
    if (have > 0 || game.tick - (last.get(def) ?? -Infinity) < game.ticksPerDay) continue;
    last.set(def, game.tick);
    game.message("msg.need_material", { item: game.reg.items.list[def].id }, "warn");
  }
}

// ---------------------------------------------------------------- roofs

/** Work ticks to put a roof on one tile. Roofs cost no materials (scrap sheets from the ruins). */
const ROOF_WORK = 30;

registerTask("roof", {
  skill: "construction",
  xp: 0.2,
  total: () => ROOF_WORK,
  valid: (game, job) => {
    const t = job.target!;
    return game.roofTodo.has(game.map.layers[0].i(t.x, t.y));
  },
  complete: (game, _p, job) => setRoof(game, job.target!.x, job.target!.y, true),
});

registerWorkGiver({
  workType: "construct",
  give: (game, p) => {
    if (!game.roofTodo.size) return null;
    const L = game.map.layers[0];
    const cands: { x: number; y: number; d: number }[] = [];
    for (const i of game.roofTodo) {
      const x = i % L.w, y = (i - x) / L.w;
      if (isReserved(game, `tile:0,${x},${y}`, p)) continue;
      cands.push({ x, y, d: (x - p.x) ** 2 + (y - p.y) ** 2 + (p.layer !== 0 ? 900 : 0) });
    }
    cands.sort((a, b) => a.d - b.d);
    for (const c of cands.slice(0, 12)) {
      const pos = { layer: 0, x: c.x, y: c.y };
      if (!game.path.canReachAdjacent(p, pos)) continue;
      const job = workJob(game, p, "roof", pos);
      if (job) return job;
    }
    return null;
  },
});
