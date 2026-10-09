/**
 * Pawn AI: movement, the decision tree ("think") and job drivers.
 * Each job is a small state machine. A driver returns "run", "done" or "fail" every tick.
 * Work jobs (build, haul, mine...) register through registerJob/registerWorkGiver in later milestones.
 */
import type { Game } from "./game.ts";
import { dropItems, takeFromStack } from "./items.ts";
import { NO_THING, type ItemStack } from "./map.ts";
import { isSleepTime, tickNeeds } from "./needs.ts";
import { isRoofed } from "./rooms.ts";
import type { Pos } from "./path.ts";
import { addMemory, hasTraitFlag, type Job, type Pawn } from "./pawn.ts";
import { workOrder } from "./worktypes.ts";

/** Tiles per tick at walk cost 1 (3 tiles per real second at 1x). */
export const WALK_SPEED = 0.15;
const STAIRS_STEP_COST = 4;

export type JobResult = "run" | "done" | "fail";
export type JobDriver = (game: Game, p: Pawn, job: Job) => JobResult;

const drivers = new Map<string, JobDriver>();
export function registerJob(kind: string, driver: JobDriver): void {
  drivers.set(kind, driver);
}

/** A work giver looks for work of one type and gives the pawn a job, or returns null. */
export interface WorkGiver {
  workType: string;
  give(game: Game, p: Pawn): Job | null;
}
const workGivers: WorkGiver[] = [];
export function registerWorkGiver(g: WorkGiver): void {
  workGivers.push(g);
}

/** Work types that have at least one giver (the ones that matter right now). */
export function activeWorkTypes(): string[] {
  return [...new Set(workGivers.map((g) => g.workType))];
}

// ---------------------------------------------------------------- reservations

export function reserve(game: Game, key: string, p: Pawn): boolean {
  const owner = game.reservations.get(key);
  if (owner !== undefined && owner !== p.id && game.pawns.has(owner)) return false;
  game.reservations.set(key, p.id);
  return true;
}

export function isReserved(game: Game, key: string, p: Pawn): boolean {
  const owner = game.reservations.get(key);
  return owner !== undefined && owner !== p.id && game.pawns.has(owner);
}

export function releaseAll(game: Game, p: Pawn): void {
  for (const [k, v] of game.reservations) if (v === p.id) game.reservations.delete(k);
}

// ---------------------------------------------------------------- movement

/** Plan a path. Returns false if the target cannot be reached. */
export function goTo(game: Game, p: Pawn, pos: Pos, adjacent = false): boolean {
  const path = game.path.find(p, pos, adjacent);
  if (!path) return false;
  p.path = path;
  p.goal = { pos, adjacent };
  p.moveT = 0;
  return true;
}

export function atGoal(p: Pawn): boolean {
  return !p.path || p.path.length === 0;
}

function stepCost(game: Game, p: Pawn, next: Pos): number {
  if (next.layer !== p.layer) return STAIRS_STEP_COST;
  const c = game.walkCost(next.layer, next.x, next.y);
  return next.x !== p.x && next.y !== p.y ? c * Math.SQRT2 : c;
}

export function moveSpeed(p: Pawn): number {
  let s = WALK_SPEED;
  if (p.needs.rest < 0.05) s *= 0.7;
  if (p.carrying) s *= 0.9;
  return s;
}

/** Advance along the path. Plans again if the next tile became blocked. */
function tickMove(game: Game, p: Pawn): void {
  if (!p.path || p.path.length === 0) return;
  const next = p.path[0];
  if (!game.walkable(next.layer, next.x, next.y)) {
    const goal = p.goal;
    p.path = null;
    if (!goal || !goTo(game, p, goal.pos, goal.adjacent)) p.goal = null;
    return;
  }
  p.moveT += moveSpeed(p) / stepCost(game, p, next);
  if (next.x !== p.x) p.facing = next.x > p.x ? 1 : -1;
  if (p.moveT >= 1) {
    p.moveT -= 1;
    p.layer = next.layer;
    p.x = next.x;
    p.y = next.y;
    p.path.shift();
    if (p.path.length === 0) p.moveT = 0;
  }
}

// ---------------------------------------------------------------- main loop

export function tickPawns(game: Game): void {
  for (const p of game.pawns.values()) {
    tickNeeds(game, p);
    if (p.mentalBreak && p.job && !p.job.data?.sulk) endJob(game, p, false);
    if (p.job) {
      const driver = drivers.get(p.job.kind);
      const r: JobResult = driver ? driver(game, p, p.job) : "fail";
      if (r !== "run") endJob(game, p, r === "fail");
    } else if (p.thinkCooldown > 0) {
      p.thinkCooldown--;
    } else {
      think(game, p);
    }
    tickMove(game, p);
  }
}

export function endJob(game: Game, p: Pawn, failed: boolean): void {
  releaseAll(game, p);
  if (p.carrying) {
    dropItems(game, p.carrying.def, p.carrying.count, p.layer, p.x, p.y, !!p.carrying.contaminated);
    p.carrying = null;
  }
  p.job = null;
  p.path = null;
  p.goal = null;
  p.asleep = false;
  if (failed) p.thinkCooldown = 15;
}

/** Interrupt the current job (used by player orders and alerts). */
export function interrupt(game: Game, p: Pawn): void {
  if (p.job) endJob(game, p, false);
}

function startJob(game: Game, p: Pawn, job: Job | null): boolean {
  if (!job) return false;
  p.job = job;
  return true;
}

/** The decision tree. Order matters: survival first, then schedule, then work, then idle. */
export function think(game: Game, p: Pawn): void {
  if (p.mentalBreak) {
    startJob(game, p, wanderJob(game, p, true));
    return;
  }
  const n = p.needs;
  if (n.thirst < 0.2 && startJob(game, p, drinkJob(game, p, true))) return;
  if (n.hunger < 0.2 && startJob(game, p, eatJob(game, p, true))) return;
  if (n.rest < 0.12 && startJob(game, p, sleepJob(game, p))) return;
  if (isSleepTime(game, p) && n.rest < 0.9) {
    // Eat and drink before bed, so nobody wakes up starving.
    if (n.thirst < 0.65 && startJob(game, p, drinkJob(game, p, false))) return;
    if (n.hunger < 0.6 && startJob(game, p, eatJob(game, p, false))) return;
    if (startJob(game, p, sleepJob(game, p))) return;
  }
  if (n.thirst < 0.45 && startJob(game, p, drinkJob(game, p, false))) return;
  if (n.hunger < 0.4 && startJob(game, p, eatJob(game, p, false))) return;
  for (const w of workOrder(p))
    for (const g of workGivers) if (g.workType === w && startJob(game, p, g.give(game, p))) return;
  startJob(game, p, wanderJob(game, p, false));
}

// ---------------------------------------------------------------- search helpers

const dist2 = (a: Pos, b: Pos) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.layer !== b.layer ? 400 : 0);

/** Nearest reachable, unreserved item stack that matches. */
export function findItem(
  game: Game,
  p: Pawn,
  match: (defIdx: number, contaminated: boolean) => boolean,
  extra?: (s: ItemStack) => boolean,
): number | null {
  const cands = [...game.items.values()].filter(
    (s) => s.layer >= 0 && match(s.def, !!s.contaminated) && !isReserved(game, `item:${s.id}`, p) && (!extra || extra(s)),
  );
  cands.sort((a, b) => dist2(p, a) - dist2(p, b));
  for (const s of cands.slice(0, 12)) if (game.path.canReach(p, s)) return s.id;
  return null;
}

/** Nearest reachable tile with water terrain of the given kinds, searched in rings around the pawn. */
function findWaterTile(game: Game, p: Pawn, kinds: string[], maxR = 60): Pos | null {
  const L = game.map.layers[p.layer];
  for (let r = 1; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = p.x + dx, y = p.y + dy;
        if (!L.inBounds(x, y)) continue;
        const w = game.reg.terrain.list[L.terrain[L.i(x, y)]].water;
        if (!w || !kinds.includes(w)) continue;
        const pos = { layer: p.layer, x, y };
        if (!isReserved(game, `tile:${p.layer},${x},${y}`, p) && game.path.canReachAdjacent(p, pos)) return pos;
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------- jobs: eat

function eatJob(game: Game, p: Pawn, desperate: boolean): Job | null {
  const food = findItem(game, p, (d, cont) => game.reg.items.list[d].category === "food" && (desperate || !cont));
  if (food === null || !reserve(game, `item:${food}`, p)) return null;
  return { kind: "eat", stage: 0, targetId: food };
}

registerJob("eat", (game, p, job) => {
  if (job.stage === 0) {
    const s = game.items.get(job.targetId!);
    if (!s || s.layer < 0) return "fail";
    if (!goTo(game, p, s)) return "fail";
    job.stage = 1;
  }
  if (job.stage === 1) {
    if (!atGoal(p)) return "run";
    const s = game.items.get(job.targetId!);
    if (!s || s.x !== p.x || s.y !== p.y || s.layer !== p.layer) return "fail";
    const def = game.reg.items.list[s.def];
    // Eat enough units to fill up, at least one.
    const units = Math.max(1, Math.min(s.count, Math.floor((1 - p.needs.hunger) / def.nutrition)));
    const taken = takeFromStack(game, s.id, units);
    job.data = { nutrition: taken * def.nutrition, food: def.id };
    job.until = game.tick + Math.round(game.ticksPerHour * 0.3);
    job.stage = 2;
  }
  if (game.tick < job.until!) return "run";
  p.needs.hunger = Math.min(1, p.needs.hunger + (job.data!.nutrition as number));
  addMemory(game, p, job.data!.food === "canned_food" ? "ate_canned" : hasTraitFlag(game, p, "eats_raw_ok") ? "ate_canned" : "ate_raw");
  return "done";
});

// ---------------------------------------------------------------- jobs: drink

function drinkJob(game: Game, p: Pawn, desperate: boolean): Job | null {
  const clean = findItem(game, p, (d, cont) => game.reg.items.list[d].id === "clean_water" && !cont);
  if (clean !== null && reserve(game, `item:${clean}`, p)) return { kind: "drink", stage: 0, targetId: clean };
  const jug = findItem(game, p, (d, cont) => game.reg.items.list[d].category === "water" && (desperate || !cont));
  if (jug !== null && reserve(game, `item:${jug}`, p)) return { kind: "drink", stage: 0, targetId: jug };
  const tile = findWaterTile(game, p, desperate ? ["clean", "dirty", "toxic"] : ["clean", "dirty"]);
  if (tile && reserve(game, `tile:${tile.layer},${tile.x},${tile.y}`, p)) return { kind: "drink", stage: 0, target: tile };
  return null;
}

registerJob("drink", (game, p, job) => {
  if (job.stage === 0) {
    if (job.targetId !== undefined) {
      const s = game.items.get(job.targetId);
      if (!s || s.layer < 0 || !goTo(game, p, s)) return "fail";
    } else if (!goTo(game, p, job.target!, true)) return "fail";
    job.stage = 1;
  }
  if (job.stage === 1) {
    if (!atGoal(p)) return "run";
    let source: string;
    let hydration: number;
    if (job.targetId !== undefined) {
      const s = game.items.get(job.targetId);
      if (!s || s.x !== p.x || s.y !== p.y || s.layer !== p.layer) return "fail";
      const def = game.reg.items.list[s.def];
      const units = Math.max(1, Math.min(s.count, Math.floor((1 - p.needs.thirst) / def.hydration)));
      hydration = takeFromStack(game, s.id, units) * def.hydration;
      source = s.contaminated ? "toxic" : def.id === "clean_water" ? "clean" : "dirty";
    } else {
      const L = game.map.layers[job.target!.layer];
      source = game.reg.terrain.list[L.terrain[L.i(job.target!.x, job.target!.y)]].water ?? "dirty";
      hydration = 1 - p.needs.thirst;
    }
    job.data = { hydration, source };
    job.until = game.tick + Math.round(game.ticksPerHour * 0.2);
    job.stage = 2;
  }
  if (game.tick < job.until!) return "run";
  p.needs.thirst = Math.min(1, p.needs.thirst + (job.data!.hydration as number));
  addMemory(game, p, job.data!.source === "clean" ? "drank_clean" : "drank_dirty");
  // Disease from dirty water and radiation from toxic water arrive with the health system (M4/M5).
  return "done";
});

// ---------------------------------------------------------------- jobs: sleep

/** The pawn's own bed, or a free unowned bed it can reach (which it then claims). */
function findBed(game: Game, p: Pawn): number | null {
  const own = p.bedId !== null ? game.things.get(p.bedId) : undefined;
  if (own && game.reg.things.list[own.def].bed && !isReserved(game, `thing:${own.id}`, p) && game.path.canReach(p, own)) return own.id;
  if (own === undefined) p.bedId = null;
  const owned = new Set([...game.pawns.values()].map((o) => o.bedId));
  const beds = [...game.things.values()]
    .filter((t) => game.reg.things.list[t.def].bed && !owned.has(t.id) && !isReserved(game, `thing:${t.id}`, p))
    .sort((a, b) => dist2(p, a) - dist2(p, b));
  for (const b of beds) {
    if (!game.path.canReach(p, b)) continue;
    p.bedId = b.id;
    return b.id;
  }
  return null;
}

function sleepJob(game: Game, p: Pawn): Job | null {
  const bed = findBed(game, p);
  if (bed !== null && reserve(game, `thing:${bed}`, p)) {
    const t = game.things.get(bed)!;
    const def = game.reg.things.list[t.def];
    return { kind: "sleep", stage: 0, target: { layer: t.layer, x: t.x, y: t.y }, data: { efficiency: def.bed!.efficiency, thought: def.bed!.thought } };
  }
  // No bed: a free ground spot near home, roofed if possible.
  const h = game.home;
  for (let tries = 0; tries < 30; tries++) {
    const x = h.x + game.aiRng.int(-5, 5), y = h.y + game.aiRng.int(-5, 5);
    const pos = { layer: h.layer, x, y };
    const L = game.map.layers[h.layer];
    if (!game.walkable(h.layer, x, y) || L.item[L.i(x, y)] !== NO_THING || L.blueprint[L.i(x, y)] !== NO_THING) continue;
    if (!reserve(game, `tile:${h.layer},${x},${y}`, p)) continue;
    if (!game.path.canReach(p, pos)) {
      game.reservations.delete(`tile:${h.layer},${x},${y}`);
      continue;
    }
    return { kind: "sleep", stage: 0, target: pos };
  }
  // No spot found: sleep where you stand.
  return { kind: "sleep", stage: 0, target: { layer: p.layer, x: p.x, y: p.y } };
}

registerJob("sleep", (game, p, job) => {
  if (job.stage === 0) {
    if (!goTo(game, p, job.target!)) return "fail";
    job.stage = 1;
  }
  if (job.stage === 1) {
    if (!atGoal(p)) return "run";
    p.asleep = true;
    job.stage = 2;
  }
  const wake = p.needs.rest >= 0.99 || (p.needs.rest > 0.7 && !isSleepTime(game, p));
  const urgent = p.needs.thirst < 0.2 || p.needs.hunger < 0.2;
  if (!wake && !urgent) return "run";
  addMemory(game, p, (job.data?.thought as string) ?? "slept_on_ground");
  if (!isRoofed(game, p.layer, p.x, p.y)) addMemory(game, p, "slept_outside");
  return "done";
});

// ---------------------------------------------------------------- jobs: wander

function wanderJob(game: Game, p: Pawn, sulking: boolean): Job | null {
  const h = game.home;
  const far = p.layer !== h.layer || Math.abs(p.x - h.x) + Math.abs(p.y - h.y) > 24;
  const c = far ? h : p;
  const r = sulking ? 10 : 7;
  for (let tries = 0; tries < 12; tries++) {
    const pos = { layer: c.layer, x: c.x + game.aiRng.int(-r, r), y: c.y + game.aiRng.int(-r, r) };
    if (game.walkable(pos.layer, pos.x, pos.y) && game.path.canReach(p, pos))
      return { kind: "wander", stage: 0, target: pos, data: { sulk: sulking } };
  }
  return { kind: "wander", stage: 1, until: game.tick + 60, data: { sulk: sulking } };
}

registerJob("wander", (game, p, job) => {
  if (job.stage === 0) {
    if (!goTo(game, p, job.target!)) return "fail";
    job.stage = 1;
    job.until = undefined;
  }
  if (!atGoal(p)) return "run";
  if (job.until === undefined) job.until = game.tick + game.aiRng.int(40, 140);
  return game.tick < job.until ? "run" : "done";
});
