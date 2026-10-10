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
import { addMemory, addRad, hasTraitFlag, traitMult, type Job, type Pawn } from "./pawn.ts";
import { isContaminatedThing } from "./weather.ts";
import { workOrder } from "./worktypes.ts";
import { moving, tickHealthHourly } from "./health.ts";
import { draftedTick, fleeFrom, hostileTick, selfDefense, updateGroups } from "./hostile.ts";
import { equipJob, inBed, rushToDowned } from "./medical.ts";
import { fluidNetOf, LITERS_PER_DRINK, netDraw, tapHasWater } from "./fluids.ts";
import { prisonerTick } from "./prison.ts";
import { robotJob, tickRobot } from "./robots.ts";

/** Tiles per tick at walk cost 1 (3 tiles per real second at 1x). */
export const WALK_SPEED = 0.15;
const STAIRS_STEP_COST = 4;

export * from "./jobs.ts";
import { cleanups, drivers, registerJob, workGivers, type JobResult } from "./jobs.ts";

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
  // Copy the position: callers often pass a pawn or item object that moves later.
  p.goal = { pos: { layer: pos.layer, x: pos.x, y: pos.y }, adjacent };
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

export function moveSpeed(game: Game, p: Pawn): number {
  let s = WALK_SPEED * game.reg.content.creatures[p.creature].speed * moving(game, p);
  if (p.needs.rest < 0.05) s *= 0.7;
  if (p.carrying) s *= 0.9;
  return s * traitMult(game, p, (t) => t.moveSpeed);
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
  p.moveT += moveSpeed(game, p) / stepCost(game, p, next);
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
  const hourly = game.tick % Math.round(game.ticksPerHour) === 0;
  if (game.tick % 30 === 0) updateGroups(game);
  if (game.tick % 30 === 15) rushToDowned(game);
  for (const p of [...game.pawns.values()]) {
    if (!game.pawns.has(p.id)) continue;
    if (p.cooldown > 0) p.cooldown--;
    if (p.robot) tickRobot(game, p);
    else if (p.faction === "colony" || p.faction === "prisoner") tickNeeds(game, p);
    if (hourly) {
      tickHealthHourly(game, p, inBed(game, p));
      if (!game.pawns.has(p.id)) continue;
    }
    if (p.health.downed) {
      if (p.job) endJob(game, p, false);
      p.path = null;
      p.drafted = false;
      continue;
    }
    if (p.faction === "prisoner" || p.faction === "visitor") {
      prisonerTick(game, p);
      tickMove(game, p);
      continue;
    }
    if (p.faction !== "colony") {
      hostileTick(game, p);
      tickMove(game, p);
      continue;
    }
    if (p.drafted) {
      draftedTick(game, p);
      tickMove(game, p);
      continue;
    }
    if (selfDefense(game, p)) continue;
    if ((game.tick + p.id) % 20 === 0 && !p.mentalBreak && fleeFrom(game, p)) {
      tickMove(game, p);
      continue;
    }
    // Sulking survivors keep only eating, drinking and the alarm care for a downed friend (rescue, feed, tend).
    const breakKeeps = p.job && ["eat", "drink", "rescue", "feed", "tend"].includes(p.job.kind);
    if (p.mentalBreak && p.job && !p.job.data?.sulk && !breakKeeps) endJob(game, p, false);
    // A radiation cloud is coming: drop idle or outdoor work and think again (that finds shelter).
    // Eating and drinking finish first: cutting them off would loop (drink, interrupted, drink...).
    const keep = p.job?.kind === "shelter" || p.job?.kind === "eat" || p.job?.kind === "drink";
    if ((game.tick + p.id) % 30 === 0 && p.job && !keep && radDanger(game) && !sheltered(game, p) && !p.mentalBreak) endJob(game, p, false);
    if (p.job) {
      // Safety nets: urgent needs win over any work, and no job may run forever.
      p.job.started ??= game.tick;
      const k = p.job.kind;
      const needJob = k === "eat" || k === "drink" || k === "sleep";
      const urgent = p.needs.hunger < 0.1 || p.needs.thirst < 0.1;
      const longOk = k === "sleep" || k === "shelter" || k === "research";
      if ((urgent && !needJob) || (!longOk && game.tick - p.job.started > game.ticksPerHour * 6)) {
        endJob(game, p, false);
        think(game, p);
        tickMove(game, p);
        continue;
      }
    }
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

registerJob("flee", (game, p, job) => (atGoal(p) && game.tick >= job.until! ? "done" : "run"));

export function endJob(game: Game, p: Pawn, failed: boolean): void {
  if (p.job) cleanups.get(p.job.kind)?.(game, p, p.job);
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
  const n = p.needs;
  if (p.robot) {
    // Robots: charge when low or hurt, else work; idle robots wait at a bay or wander.
    const r = robotJob(game, p);
    if (r === "idle") return;
    if (r && startJob(game, p, r)) return;
    for (const w of workOrder(p)) for (const g of workGivers) if (g.workType === w && startJob(game, p, g.give(game, p))) return;
    if ((p.charge ?? 1) < 0.9) {
      const rest = robotJob(game, { ...p, charge: 0.1 } as Pawn);
      if (rest && rest !== "idle" && startJob(game, p, rest)) return;
    }
    startJob(game, p, wanderJob(game, p, false));
    return;
  }
  if (p.mentalBreak) {
    // Sulking survivors still eat and drink when it gets urgent.
    if (n.thirst < 0.2 && startJob(game, p, drinkJob(game, p, true))) return;
    if (n.hunger < 0.2 && startJob(game, p, eatJob(game, p, true))) return;
    startJob(game, p, wanderJob(game, p, true));
    return;
  }
  if (n.thirst < 0.2 && startJob(game, p, drinkJob(game, p, true))) return;
  if (n.hunger < 0.2 && startJob(game, p, eatJob(game, p, true))) return;
  if (n.rest < 0.12 && startJob(game, p, sleepJob(game, p))) return;
  if (radDanger(game) && !sheltered(game, p) && startJob(game, p, shelterJob(game, p))) return;
  if (isSleepTime(game, p) && n.rest < 0.9) {
    // Eat and drink before bed, so nobody wakes up starving.
    if (n.thirst < 0.65 && startJob(game, p, drinkJob(game, p, false))) return;
    if (n.hunger < 0.6 && startJob(game, p, eatJob(game, p, false))) return;
    if (startJob(game, p, sleepJob(game, p))) return;
  }
  if (n.thirst < 0.45 && startJob(game, p, drinkJob(game, p, false))) return;
  if (n.hunger < 0.4 && startJob(game, p, eatJob(game, p, false))) return;
  if (p.weapon === null && startJob(game, p, equipJob(game, p))) return;
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

/** Food preference: meals first, then cans, then raw food. Contaminated food only when desperate. */
function eatJob(game: Game, p: Pawn, desperate: boolean): Job | null {
  const tiers: ((d: number) => boolean)[] = [
    (d) => game.reg.items.list[d].category === "food" && !game.reg.items.list[d].raw && game.reg.items.list[d].id !== "canned_food",
    (d) => game.reg.items.list[d].id === "canned_food",
    (d) => game.reg.items.list[d].category === "food" && game.reg.items.list[d].raw,
  ];
  for (const allowCont of desperate ? [false, true] : [false]) {
    for (const tier of tiers) {
      const food = findItem(game, p, (d, cont) => tier(d) && (allowCont || !cont));
      if (food !== null && reserve(game, `item:${food}`, p)) return { kind: "eat", stage: 0, targetId: food };
    }
  }
  return null;
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
    const glowing = !!s.contaminated;
    const taken = takeFromStack(game, s.id, units);
    job.data = { nutrition: taken * def.nutrition, food: def.id, glowing };
    job.until = game.tick + Math.round(game.ticksPerHour * 0.3);
    job.stage = 2;
  }
  if (game.tick < job.until!) return "run";
  p.needs.hunger = Math.min(1, p.needs.hunger + (job.data!.nutrition as number));
  const def = game.reg.items.get(job.data!.food as string);
  const raw = def.raw && hasTraitFlag(game, p, "eats_raw_ok");
  addMemory(game, p, raw ? "ate_canned" : (def.eatThought ?? "ate_canned"));
  if (job.data!.glowing) {
    addRad(game, p, 0.05);
    addMemory(game, p, "ate_glowing_food");
  }
  return "done";
});

// ---------------------------------------------------------------- jobs: drink

/** Water things (wells) that a pawn can drink from. */
function findWaterThing(game: Game, p: Pawn): Pos | null {
  const wells = [...game.things.values()]
    .filter((t) => {
      const d = game.reg.things.list[t.def];
      // A tap only counts when its pipes hold clean water.
      return d.water && (d.fluid?.role !== "tap" || tapHasWater(game, t)) && !isReserved(game, `tile:${t.layer},${t.x},${t.y}`, p);
    })
    .sort((a, b) => dist2(p, a) - dist2(p, b));
  for (const w of wells.slice(0, 6)) if (game.path.canReachAdjacent(p, w)) return { layer: w.layer, x: w.x, y: w.y };
  return null;
}

function drinkJob(game: Game, p: Pawn, desperate: boolean): Job | null {
  const clean = findItem(game, p, (d, cont) => game.reg.items.list[d].id === "clean_water" && !cont);
  if (clean !== null && reserve(game, `item:${clean}`, p)) return { kind: "drink", stage: 0, targetId: clean };
  const well = findWaterThing(game, p);
  if (well && reserve(game, `tile:${well.layer},${well.x},${well.y}`, p)) return { kind: "drink", stage: 0, target: well };
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
    let glowing: boolean;
    if (job.targetId !== undefined) {
      const s = game.items.get(job.targetId);
      if (!s || s.x !== p.x || s.y !== p.y || s.layer !== p.layer) return "fail";
      const def = game.reg.items.list[s.def];
      const units = Math.max(1, Math.min(s.count, Math.floor((1 - p.needs.thirst) / def.hydration)));
      glowing = !!s.contaminated;
      hydration = takeFromStack(game, s.id, units) * def.hydration;
      source = def.id === "clean_water" ? "clean" : "dirty";
    } else {
      const t = job.target!;
      const L = game.map.layers[t.layer];
      const th = L.thing[L.i(t.x, t.y)];
      if (th !== NO_THING && game.reg.things.list[game.things.get(th)!.def].fluid?.role === "tap") {
        // A tap gives what its pipes hold, up to a full drink.
        const net = fluidNetOf(game, game.things.get(th)!);
        const liters = net ? netDraw(game, net, "clean_water", (1 - p.needs.thirst) * LITERS_PER_DRINK) : 0;
        if (liters <= 0) return "fail";
        job.data = { hydration: liters / LITERS_PER_DRINK, source: "clean", glowing: false };
        job.until = game.tick + Math.round(game.ticksPerHour * 0.2);
        job.stage = 2;
        return "run";
      } else if (th !== NO_THING && game.reg.things.list[game.things.get(th)!.def].water) {
        const well = game.things.get(th)!;
        source = game.reg.things.list[well.def].water!;
        glowing = isContaminatedThing(game, well);
      } else {
        source = game.reg.terrain.list[L.terrain[L.i(t.x, t.y)]].water ?? "dirty";
        glowing = t.layer === 0 && game.openWaterContamUntil > game.tick;
      }
      if (source === "toxic") glowing = true;
      hydration = 1 - p.needs.thirst;
    }
    job.data = { hydration, source, glowing };
    job.until = game.tick + Math.round(game.ticksPerHour * 0.2);
    job.stage = 2;
  }
  if (game.tick < job.until!) return "run";
  p.needs.thirst = Math.min(1, p.needs.thirst + (job.data!.hydration as number));
  addMemory(game, p, job.data!.source === "clean" && !job.data!.glowing ? "drank_clean" : "drank_dirty");
  if (job.data!.glowing) addRad(game, p, 0.04);
  // Disease from dirty water arrives with the health system (M5).
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
    .filter((t) => game.reg.things.list[t.def].bed && !t.forPrisoners && !owned.has(t.id) && !isReserved(game, `thing:${t.id}`, p))
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

// ---------------------------------------------------------------- jobs: shelter

/** True while a radiation cloud is here or less than 2 hours away. */
export function radDanger(game: Game): boolean {
  const w = game.weather;
  return w.kind === "rad_cloud" || (w.next?.kind === "rad_cloud" && w.next.at - game.tick < 2 * game.ticksPerHour);
}

export function sheltered(game: Game, p: Pawn): boolean {
  return p.layer > 0 || isRoofed(game, p.layer, p.x, p.y);
}

/** Nearest roofed tile by walking distance (breadth-first), else the cave under the stairs. */
function shelterJob(game: Game, p: Pawn): Job | null {
  const L = game.map.layers[p.layer];
  const seen = new Set<number>([L.i(p.x, p.y)]);
  let frontier: [number, number][] = [[p.x, p.y]];
  for (let steps = 0; steps < 80 && frontier.length; steps++) {
    const next: [number, number][] = [];
    for (const [x, y] of frontier) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (!game.walkable(p.layer, nx, ny)) continue;
        const i = L.i(nx, ny);
        if (seen.has(i)) continue;
        seen.add(i);
        if (isRoofed(game, p.layer, nx, ny) && !isReserved(game, `tile:${p.layer},${nx},${ny}`, p)) {
          reserve(game, `tile:${p.layer},${nx},${ny}`, p);
          return { kind: "shelter", stage: 0, target: { layer: p.layer, x: nx, y: ny } };
        }
        next.push([nx, ny]);
      }
    }
    frontier = next;
  }
  const stairs = [...game.things.values()].find((t) => game.reg.things.list[t.def].id === "stairs_up");
  if (stairs && game.path.canReach(p, stairs)) return { kind: "shelter", stage: 0, target: { layer: stairs.layer, x: stairs.x, y: stairs.y } };
  return null;
}

registerJob("shelter", (game, p, job) => {
  if (job.stage === 0) {
    if (!goTo(game, p, job.target!)) return "fail";
    job.stage = 1;
  }
  if (!atGoal(p)) return "run";
  // Wait out the cloud; leave early only for urgent needs.
  if (p.needs.thirst < 0.15 || p.needs.hunger < 0.15) return "done";
  return radDanger(game) ? "run" : "done";
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
