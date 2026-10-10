/**
 * Construction (spec 03): blueprints, material delivery and building.
 * The player places a blueprint. Survivors bring the materials (several blueprints per trip when
 * they are close together), then one survivor builds it.
 */
import { addStat } from "./pawn.ts";
import { atGoal, findItem, goTo, isReserved, reserve } from "./ai.ts";
import { registerJob, registerWorkGiver } from "./jobs.ts";
import type { Game } from "./game.ts";
import { countItems, dropItems, takeFromStack } from "./items.ts";
import { NO_THING, type Blueprint } from "./map.ts";
import { dropCarried, pickUp } from "./hauling.ts";
import type { Pawn } from "./pawn.ts";
import { canDesignate, designate } from "./designations.ts";
import { setRoof } from "./rooms.ts";
import { registerTask, workJob } from "./work.ts";

/** Blueprints within this many tiles share one delivery trip. */
const BATCH_RADIUS = 10;

function buildInfo(game: Game, kind: Blueprint["kind"], def: number) {
  return kind === "thing" ? game.reg.things.list[def].build : game.reg.floors.list[def].build;
}

/** A plant or a ruin/junk on a tile that a plan may go over. It is cut or salvaged first. */
function clearOrder(game: Game, layer: number, x: number, y: number): "cut" | "salvage" | null {
  const def = game.thingDefAt(layer, x, y);
  if (!def) return null;
  if (def.kind === "plant") return "cut";
  return canDesignate(game, "salvage", layer, x, y) ? "salvage" : null;
}

/** Tiles a plan covers (one for floors). */
function planTiles(game: Game, kind: Blueprint["kind"], def: number, x: number, y: number, rot?: number) {
  return kind === "thing" ? game.footprint(def, x, y, rot) : [{ x, y }];
}

/** True while something still stands on one of the plan's tiles. */
function blocked(game: Game, bp: Blueprint): boolean {
  const L = game.map.layers[bp.layer];
  return bp.kind === "thing" && planTiles(game, bp.kind, bp.def, bp.x, bp.y, bp.rot).some((t) => L.thing[L.i(t.x, t.y)] !== NO_THING);
}

/** Can a blueprint of this def go here? Big things check every tile they cover. */
export function canPlace(game: Game, kind: Blueprint["kind"], defId: string, layer: number, x: number, y: number, rot?: number): boolean {
  if (kind === "floor") return canPlaceTile(game, kind, defId, layer, x, y);
  const tiles = game.footprint(game.reg.things.idx(defId), x, y, rot);
  if (tiles.length === 1) return canPlaceTile(game, kind, defId, layer, x, y);
  // A big thing may not cut into another plan.
  const L = game.map.layers[layer];
  return tiles.every((t) => L.inBounds(t.x, t.y) && L.blueprint[L.i(t.x, t.y)] === NO_THING && canPlaceTile(game, kind, defId, layer, t.x, t.y));
}

function canPlaceTile(game: Game, kind: Blueprint["kind"], defId: string, layer: number, x: number, y: number): boolean {
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
  // Stairs down need a layer below.
  if ((game.reg.things.get(defId).stairs ?? 0) > 0 && layer + 1 >= game.map.layers.length) return false;
  return L.thing[i] === NO_THING || clearOrder(game, layer, x, y) !== null;
}

export function placeBlueprint(game: Game, kind: Blueprint["kind"], defId: string, layer: number, x: number, y: number, rot?: number): Blueprint | null {
  if (!canPlace(game, kind, defId, layer, x, y, rot)) return null;
  const Lr = game.map.layers[layer];
  const replaced = Lr.blueprint[Lr.i(x, y)];
  if (replaced !== NO_THING) cancelBlueprint(game, replaced);
  const def = kind === "thing" ? game.reg.things.idx(defId) : game.reg.floors.idx(defId);
  const tiles = planTiles(game, kind, def, x, y, rot);
  const info = buildInfo(game, kind, def)!;
  const need: Record<number, number> = {};
  for (const [item, n] of Object.entries(info.cost)) need[game.reg.items.idx(item)] = n;
  const bp: Blueprint = { id: game.newId(), kind, def, layer, x, y, need, work: info.work, ...(rot !== undefined ? { rot } : {}) };
  // Something in the way: order it cut or salvaged. Building waits until the tiles are clear.
  for (const t of kind === "thing" ? tiles : []) {
    const clear = clearOrder(game, layer, t.x, t.y);
    if (clear) designate(game, clear, layer, t.x, t.y);
  }
  game.blueprints.set(bp.id, bp);
  const L = game.map.layers[layer];
  for (const t of tiles) {
    L.blueprint[L.i(t.x, t.y)] = bp.id;
    L.touch(t.x, t.y);
  }
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
  for (const t of planTiles(game, bp.kind, bp.def, bp.x, bp.y, bp.rot)) {
    if (L.blueprint[L.i(t.x, t.y)] !== bp.id) continue;
    L.blueprint[L.i(t.x, t.y)] = NO_THING;
    L.touch(t.x, t.y);
  }
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
  const tiles = game.footprint(bp.def, bp.x, bp.y, bp.rot);
  const moved: { def: number; count: number; contaminated: boolean; x: number; y: number }[] = [];
  for (const t of def.blocks ? tiles : []) {
    const it = L.item[L.i(t.x, t.y)];
    if (it === NO_THING) continue;
    const s = game.items.get(it)!;
    moved.push({ def: s.def, count: s.count, contaminated: !!s.contaminated, x: t.x, y: t.y });
    takeFromStack(game, s.id, s.count);
  }
  game.spawnThing(def.id, bp.layer, bp.x, bp.y, bp.rot);
  if ((def.stairs ?? 0) > 0) digDown(game, bp.layer + 1, bp.x, bp.y);
  for (const m of moved) dropItems(game, m.def, m.count, bp.layer, m.x, m.y, m.contaminated);
  if (def.blocks) {
    for (const p of game.pawns.values()) {
      if (p.layer !== bp.layer || !tiles.some((t) => t.x === p.x && t.y === p.y)) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        if (game.walkable(bp.layer, p.x + dx, p.y + dy)) {
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
    return !!bp && !needsMaterials(bp) && !blocked(game, bp);
  },
  complete: (game, p, job) => {
    addStat(p, "built");
    completeBlueprint(game, game.blueprints.get(job.targetId!)!);
  },
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
    for (const bp of nearestBlueprints(game, p, (b) => !needsMaterials(b) && !blocked(game, b)).slice(0, 10)) {
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

/** Dug stairs: open a small room on the layer below and put the way up there. */
export function digDown(game: Game, layer: number, x: number, y: number): void {
  const L = game.map.layers[layer];
  if (!L) return;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const tx = x + dx, ty = y + dy;
      if (!L.inBounds(tx, ty)) continue;
      const i = L.i(tx, ty);
      const th = L.thing[i];
      if (th !== NO_THING && (dx === 0 && dy === 0 ? true : game.reg.things.list[game.things.get(th)!.def].blocks)) game.removeThing(th);
      if (game.reg.terrain.list[L.terrain[i]].solid) game.setTerrain(layer, tx, ty, "rough_floor");
    }
  game.spawnThing("stairs_up", layer, x, y);
}

// ---------------------------------------------------------------- status for the UI

export interface BlueprintStatus {
  /** Per material: delivered so far and the total cost (item id). */
  materials: { item: string; have: number; total: number }[];
  /** Survivors on this plan right now: bringing an item, or building. */
  workers: { name: string; doing: "bring" | "build"; item?: string }[];
  /** Materials the map does not hold enough of (not counting what is already delivered). */
  short: string[];
  /** 0..1 once building has started. */
  progress: number;
}

/** What a plan has, still needs, and who works on it (for the inspect panel and the map). */
export function blueprintStatus(game: Game, bp: Blueprint): BlueprintStatus {
  const info = buildInfo(game, bp.kind, bp.def)!;
  const materials = Object.entries(info.cost).map(([item, total]) => ({ item, total, have: total - (bp.need[game.reg.items.idx(item)] ?? 0) }));
  const workers: BlueprintStatus["workers"] = [];
  for (const p of game.pawns.values()) {
    const j = p.job;
    if (!j || p.faction !== "colony") continue;
    if (j.kind === "deliver" && j.data?.bp === bp.id) workers.push({ name: p.nick, doing: "bring", item: game.reg.items.list[j.data.item as number]?.id });
    else if (j.kind === "work" && j.data?.task === "build" && j.targetId === bp.id) workers.push({ name: p.nick, doing: "build" });
  }
  const short = materials.filter((m) => m.have < m.total && countItems(game, m.item) < m.total - m.have).map((m) => m.item);
  // Build work left is kept per spot (see work.ts), like every other task.
  const total = info.work;
  const left = game.progress.get(`build:${bp.layer},${bp.x},${bp.y}`) ?? total;
  return { materials, workers, short, progress: total > 0 ? Math.max(0, Math.min(1, 1 - left / total)) : 0 };
}