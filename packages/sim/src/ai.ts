/**
 * Pawn AI: movement, the decision tree ("think") and job drivers.
 * Each job is a small state machine. A driver returns "run", "done" or "fail" every tick.
 * Work jobs (build, haul, mine...) register through registerJob/registerWorkGiver in later milestones.
 */
import { rearmJob } from "./traps.ts";
import { armorMove } from "./gear.ts";
import type { Game } from "./game.ts";
import { dropItems, takeFromStack } from "./items.ts";
import { NO_THING, type ItemStack, type Thing } from "./map.ts";
import { isSleepTime, tickNeeds } from "./needs.ts";
import { exposureAt, isRoofed } from "./rooms.ts";
import type { Pos } from "./path.ts";
import { addMemory, addRad, hasTraitFlag, traitMult, type Job, type Pawn } from "./pawn.ts";
import { isContaminatedThing } from "./weather.ts";
import { workOrder, workPriority, type WorkType } from "./worktypes.ts";
import { haulJob } from "./hauling.ts";
import { DIRS4 } from "./logistics.ts";
import { relaxJob, slotNow } from "./recreation.ts";
import { findOwnWork, ownWorkJob } from "./designations.ts";
import { moving, pain, tickHealthHourly } from "./health.ts";
import { draftedTick, fleeFrom, hostileTick, selfDefense, updateGroups } from "./hostile.ts";
import { nearestHostile } from "./combat.ts";

/** Drafted survivors break off for a drink or a meal below this need level. */
const DRAFTED_CRITICAL = 0.15;
/** Speed of a robot with no charge left. */
const ROBOT_CRAWL = 0.2;
import { bedAt, equipJob, freeBed, inBed, rushToDowned } from "./medical.ts";
import { fluidNetOf, LITERS_PER_DRINK, netDraw, tapHasWater } from "./fluids.ts";
import { prisonerTick } from "./prison.ts";
import { robotJob, tickRobot } from "./robots.ts";
import { traderTick } from "./factions.ts";

/** Tiles per tick at walk cost 1 (3 tiles per real second at 1x). */
export const WALK_SPEED = 0.15;
const STAIRS_STEP_COST = 4;

export * from "./jobs.ts";
import { cleanups, drivers, registerCleanup, registerJob, workGivers, type JobResult } from "./jobs.ts";

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
  // A robot out of charge crawls on its last reserve, at a fifth of its speed.
  if (p.robot && (p.charge ?? 1) <= 0) s *= ROBOT_CRAWL;
  return s * traitMult(game, p, (t) => t.moveSpeed) * armorMove(game, p);
}

/**
 * Nobody may stand inside something solid (a machine built on them, a robot placed on a turbine):
 * move them to the nearest free tile, in rings around where they stand.
 */
export function unstick(game: Game, p: Pawn): void {
  if (game.walkable(p.layer, p.x, p.y)) return;
  for (let r = 1; r <= 8; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !game.walkable(p.layer, p.x + dx, p.y + dy)) continue;
        p.x += dx;
        p.y += dy;
        p.path = null;
        p.moveT = 0;
        return;
      }
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
  if (game.tick % 30 === 5) for (const p of game.pawns.values()) unstick(game, p);
  for (const p of [...game.pawns.values()]) {
    if (!game.pawns.has(p.id)) continue;
    if (p.cooldown > 0) p.cooldown--;
    if (p.robot) tickRobot(game, p);
    else if (p.faction === "colony" || p.faction === "prisoner") tickNeeds(game, p);
    if (hourly) {
      tickHealthHourly(game, p, bedAt(game, p)?.medical ? "medical" : inBed(game, p));
      if (!game.pawns.has(p.id)) continue;
    }
    if (p.health.downed) {
      if (p.job) endJob(game, p, false);
      p.path = null;
      p.drafted = false;
      continue;
    }
    if (p.faction === "trader") {
      traderTick(game, p);
      tickMove(game, p);
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
      // Drafted survivors stay put, but when thirst or hunger gets critical and no enemy is close,
      // they take a quick drink or meal and stay drafted (else a long stand-off kills them).
      const n = p.needs;
      const critical = n.thirst < DRAFTED_CRITICAL || n.hunger < DRAFTED_CRITICAL;
      if (!p.job && critical && p.order?.kind !== "attack" && (game.tick + p.id) % 30 === 0 && !nearestHostile(game, p, "colony", 8)) {
        const j = n.thirst <= n.hunger ? (drinkJob(game, p, true) ?? eatJob(game, p, true)) : (eatJob(game, p, true) ?? drinkJob(game, p, true));
        if (j) startJob(game, p, j);
      }
      if (p.job && (p.job.kind === "eat" || p.job.kind === "drink")) {
        const driver = drivers.get(p.job.kind)!;
        const r = driver(game, p, p.job);
        if (r !== "run") endJob(game, p, r === "fail");
      } else draftedTick(game, p);
      tickMove(game, p);
      continue;
    }
    if (selfDefense(game, p)) continue;
    if ((game.tick + p.id) % 20 === 0 && !p.mentalBreak && fleeFrom(game, p)) {
      tickMove(game, p);
      continue;
    }
    // Sulking survivors keep only eating, drinking and the alarm care for a downed friend (rescue, feed, tend).
    const breakKeeps = p.job && ["eat", "forage", "drink", "rescue", "feed", "tend"].includes(p.job.kind);
    if (p.mentalBreak && p.job && !p.job.data?.sulk && !breakKeeps) endJob(game, p, false);
    // A radiation cloud is coming: drop idle or outdoor work and think again (that finds shelter).
    // Eating and drinking finish first: cutting them off would loop (drink, interrupted, drink...).
    const keep = p.job?.kind === "shelter" || p.job?.kind === "eat" || p.job?.kind === "drink";
    if ((game.tick + p.id) % 30 === 0 && p.job && !keep && radDanger(game) && !sheltered(game, p) && !p.mentalBreak) endJob(game, p, false);
    if (p.job) {
      // Safety nets: urgent needs win over any work, and no job may run forever.
      p.job.started ??= game.tick;
      const k = p.job.kind;
      const needJob = k === "eat" || k === "forage" || k === "drink" || k === "sleep";
      const urgent = p.needs.hunger < 0.1 || p.needs.thirst < 0.1;
      const longOk = k === "sleep" || k === "shelter" || k === "research" || k === "charge";
      if ((urgent && !needJob) || (!longOk && game.tick - p.job.started > game.ticksPerHour * 6)) {
        endJob(game, p, false);
        think(game, p);
        tickMove(game, p);
        continue;
      }
    }
    if (p.job && (game.tick + p.id) % PREEMPT_EVERY === 0 && preemptWork(game, p)) {
      tickMove(game, p);
      continue;
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
  if (p.job?.workType) noteWorkResult(game, p, p.job.workType, failed);
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

/** Orders a survivor gave itself: any real work takes over. */
function startIdle(game: Game, p: Pawn, job: Job | null): boolean {
  if (job) job.workType = "idle";
  return startJob(game, p, job);
}

/**
 * Safety net: work of one type that fails again and again (a bad order, an unreachable target) must not
 * block every lower-ranked work. After 3 failures in a row a survivor skips that work type for a while.
 */
const FAILS_TO_SKIP = 3;
const SKIP_TICKS = 600;
const workFails = new WeakMap<Game, Map<string, { n: number; until: number }>>();

function noteWorkResult(game: Game, p: Pawn, w: string, failed: boolean) {
  const m = workFails.get(game) ?? new Map<string, { n: number; until: number }>();
  workFails.set(game, m);
  const k = `${p.id}:${w}`;
  if (!failed) {
    m.delete(k);
    return;
  }
  const f = m.get(k) ?? { n: 0, until: 0 };
  f.n++;
  if (f.n >= FAILS_TO_SKIP) {
    f.until = game.tick + SKIP_TICKS;
    f.n = 0;
  }
  m.set(k, f);
}

function skipping(game: Game, p: Pawn, w: string): boolean {
  return (workFails.get(game)?.get(`${p.id}:${w}`)?.until ?? 0) > game.tick;
}

/** Take the first job any giver of this work type offers. The job remembers its work type. */
function startWork(game: Game, p: Pawn, w: string): boolean {
  if (skipping(game, p, w)) return false;
  for (const g of workGivers) {
    if (g.workType !== w) continue;
    const job = g.give(game, p);
    if (job) {
      job.workType = w;
      p.job = job;
      return true;
    }
  }
  return false;
}

/** Ticks between two looks for more important work while working. */
const PREEMPT_EVERY = 60;

/**
 * While working, look now and then for work that ranks higher (better priority number, or the same
 * number and an earlier column). If there is some, drop the current job and take it.
 */
function preemptWork(game: Game, p: Pawn): boolean {
  const cur = p.job?.workType;
  if (!cur || p.drafted || p.mentalBreak) return false;
  const order = workOrder(p);
  const rank = cur === "idle" ? order.length : order.indexOf(cur as WorkType);
  for (const w of order.slice(0, Math.max(0, rank))) {
    if (skipping(game, p, w) || !workGivers.some((g) => g.workType === w && g.give(game, p))) {
      continue;
    }
    // Found: drop the old job (its reservations go too), then take the new one fresh.
    endJob(game, p, false);
    if (startWork(game, p, w)) return true;
  }
  return false;
}

/** The decision tree. Order matters: survival first, then schedule, then work, then idle. */
export function think(game: Game, p: Pawn): void {
  const n = p.needs;
  if (p.robot) {
    // Robots: charge when low or hurt, else work; idle robots wait at a bay or wander.
    const r = robotJob(game, p);
    if (r === "idle") return;
    if (r && startJob(game, p, r)) return;
    if (workPriority(p, "haul") > 0 && startJob(game, p, haulJob(game, p, true))) return;
    for (const w of workOrder(p)) if (startWork(game, p, w)) return;
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
  const slot = slotNow(game, p);
  if (isSleepTime(game, p) && n.rest < 0.9) {
    // Eat and drink before bed, so nobody wakes up starving.
    if (n.thirst < 0.65 && startJob(game, p, drinkJob(game, p, false))) return;
    if (n.hunger < 0.6 && startJob(game, p, eatJob(game, p, false))) return;
    if (startJob(game, p, sleepJob(game, p))) return;
  }
  if (n.thirst < 0.45 && startJob(game, p, drinkJob(game, p, false))) return;
  if (n.hunger < 0.4 && startJob(game, p, eatJob(game, p, false))) return;
  // Sprung traps come right after food and water, before any other work (user request).
  if (workPriority(p, "construct") > 0 && startJob(game, p, rearmJob(game, p))) return;
  if (startJob(game, p, equipJob(game, p))) return;
  // Recreation: in joy hours until fun is full; in "any" hours when bored; in work hours only when joyless.
  // Never while hungry or thirsty: then food and water work comes first.
  const needy = n.hunger < 0.3 || n.thirst < 0.3;
  const wantFun = !needy && (slot === "joy" ? n.fun < 0.95 : slot === "work" ? n.fun < 0.05 : n.fun < 0.3);
  if (wantFun && startJob(game, p, relaxJob(game, p))) return;
  // "Haul now" stacks come before all other work for anyone who hauls.
  if (workPriority(p, "haul") > 0 && startJob(game, p, haulJob(game, p, true))) return;
  // Work (user: the priorities decide every choice): best priority number first, then column order.
  for (const w of workOrder(p)) if (startWork(game, p, w)) return;
  // Nothing to do: take an order you gave yourself, or give yourself one (salvage junk or cut dead wood near home).
  if (startIdle(game, p, ownWorkJob(game, p))) return;
  if (findOwnWork(game, p) && startIdle(game, p, ownWorkJob(game, p))) return;
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
  /** Optional first sort key (lower first), before distance. */
  rank?: (s: ItemStack) => number,
): number | null {
  const cands = [...game.items.values()].filter(
    (s) => s.layer >= 0 && !s.forbidden && match(s.def, !!s.contaminated) && !isReserved(game, `item:${s.id}`, p) && (!extra || extra(s)),
  );
  if (rank) {
    const r = new Map(cands.map((s) => [s.id, rank(s)]));
    cands.sort((a, b) => r.get(a.id)! - r.get(b.id)! || dist2(p, a) - dist2(p, b));
  } else cands.sort((a, b) => dist2(p, a) - dist2(p, b));
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
  // No food anywhere and hungry: pick a ripe food crop and eat it in the field (user report: survivors
  // starved next to ripe crops while sulking).
  if (desperate || p.needs.hunger < 0.25) return forageJob(game, p);
  return null;
}

/** Work ticks to pick a crop by hand. */
const FORAGE_WORK = 40;

function forageJob(game: Game, p: Pawn): Job | null {
  const cands = [...game.things.values()]
    .filter((t) => {
      const c = game.reg.things.list[t.def].crop;
      return !!c && (t.growth ?? 0) >= 1 && Object.keys(c.yield).some((id) => game.reg.items.get(id).category === "food");
    })
    .sort((a, b) => dist2(p, a) - dist2(p, b));
  for (const t of cands.slice(0, 8)) {
    const key = `tile:${t.layer},${t.x},${t.y}`;
    if (isReserved(game, key, p) || !game.path.canReachAdjacent(p, t)) continue;
    if (!reserve(game, key, p)) continue;
    return { kind: "forage", stage: 0, target: { layer: t.layer, x: t.x, y: t.y }, data: { work: FORAGE_WORK } };
  }
  return null;
}

registerJob("forage", (game, p, job) => {
  const t = job.target!;
  const L = game.map.layers[t.layer];
  const th = L.thing[L.i(t.x, t.y)];
  if (th === NO_THING || (game.things.get(th)!.growth ?? 0) < 1) return "fail";
  if (job.stage === 0) {
    if (!goTo(game, p, t, true)) return "fail";
    job.stage = 1;
  }
  if (!atGoal(p)) return "run";
  job.data!.work = (job.data!.work as number) - 1;
  if ((job.data!.work as number) > 0) return "run";
  // Picked: the harvest drops on the tile, and the survivor eats from it now.
  const def = game.reg.things.list[game.things.get(th)!.def];
  game.removeThing(th);
  for (const [item, n] of Object.entries(def.crop!.yield)) dropItems(game, item, n, t.layer, t.x, t.y);
  const food = Object.keys(def.crop!.yield).find((id) => game.reg.items.get(id).category === "food");
  const stack = L.item[L.i(t.x, t.y)];
  if (!food || stack === NO_THING || game.reg.items.list[game.items.get(stack)!.def].id !== food) return "done";
  releaseAll(game, p);
  reserve(game, `item:${stack}`, p);
  p.job = { kind: "eat", stage: 0, targetId: stack };
  return "run";
});

// Cut off on the way to the table: the food goes back on the ground.
registerCleanup("eat", (game, p, job) => {
  if (job.stage === 3 && !job.data?.eaten && typeof job.data?.units === "number")
    dropItems(game, job.data.food as string, job.data.units, p.layer, p.x, p.y, !!job.data.glowing);
});

/** Food poisoning chance per meal: raw food, cooked meals, canned food. A table cuts it. */
const POISON_CHANCE = { raw: 0.06, cooked: 0.02, canned: 0.004 };
const TABLE_POISON_MULT = 0.4;
/** How long food poisoning lasts (in-game hours). */
const POISON_HOURS = 10;

/** A free chair next to a table, near enough to carry the food to. */
function findSeat(game: Game, p: Pawn): Thing | null {
  let best: Thing | null = null, bestD = 40 * 40;
  for (const t of game.things.values()) {
    if (t.layer !== p.layer || !game.reg.things.list[t.def].seat) continue;
    const d = (t.x - p.x) ** 2 + (t.y - p.y) ** 2;
    if (d >= bestD || isReserved(game, `seat:${t.id}`, p)) continue;
    const L = game.map.layers[t.layer];
    const byTable = DIRS4.some(([dx, dy]) => {
      if (!L.inBounds(t.x + dx, t.y + dy)) return false;
      const o = L.thing[L.i(t.x + dx, t.y + dy)];
      return o !== NO_THING && game.reg.things.list[game.things.get(o)!.def].table;
    });
    if (byTable && game.path.canReach(p, t)) {
      best = t;
      bestD = d;
    }
  }
  return best;
}

/**
 * Eat: walk to the food, take a meal's worth, carry it to a free seat at a table if there is one,
 * then eat. At a table: a small mood lift and less chance of food poisoning.
 */
registerJob("eat", (game, p, job) => {
  if (job.stage === 3) {
    // Carrying the food to the table.
    if (!atGoal(p)) return "run";
    job.until = game.tick + Math.round(game.ticksPerHour * 0.3);
    job.stage = 2;
  }
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
    job.data = { nutrition: taken * def.nutrition, food: def.id, glowing, units: taken };
    // A seat at a table nearby: carry the food there first (not when starving).
    const seat = p.needs.hunger > 0.1 ? findSeat(game, p) : null;
    if (seat && reserve(game, `seat:${seat.id}`, p) && goTo(game, p, { layer: seat.layer, x: seat.x, y: seat.y })) {
      job.data.table = true;
      job.stage = 3;
      return "run";
    }
    job.until = game.tick + Math.round(game.ticksPerHour * 0.3);
    job.stage = 2;
  }
  if (game.tick < job.until!) return "run";
  p.needs.hunger = Math.min(1, p.needs.hunger + (job.data!.nutrition as number));
  const def = game.reg.items.get(job.data!.food as string);
  const raw = def.raw && hasTraitFlag(game, p, "eats_raw_ok");
  addMemory(game, p, raw ? "ate_canned" : (def.eatThought ?? "ate_canned"));
  job.data!.eaten = true;
  const atTable = !!job.data!.table;
  if (atTable) addMemory(game, p, "ate_at_table");
  // Food poisoning: raw food most, canned food hardly; a table cuts the chance.
  const base = def.id === "canned_food" ? POISON_CHANCE.canned : def.raw ? POISON_CHANCE.raw : POISON_CHANCE.cooked;
  if (!hasTraitFlag(game, p, "eats_raw_ok") && game.aiRng.next() < base * (atTable ? TABLE_POISON_MULT : 1)) {
    p.sickUntil = game.tick + Math.round(POISON_HOURS * game.ticksPerHour);
    addMemory(game, p, "food_poisoning");
    game.message("msg.food_poisoning", { name: p.nick }, "warn", p);
  }
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
    .filter((t) => game.reg.things.list[t.def].bed && !t.forPrisoners && !t.medical && !owned.has(t.id) && !isReserved(game, `thing:${t.id}`, p))
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

// ---------------------------------------------------------------- jobs: bed rest

/** Pain and blood loss above which a survivor who can still walk goes to bed (user: "badly hurt needs to rest"). */
const REST_PAIN = 0.4, REST_BLOOD = 0.3;
/** ...and below which they get up again. */
const UP_PAIN = 0.2, UP_BLOOD = 0.15;

export function needsBedRest(game: Game, p: Pawn, resting = false): boolean {
  if (p.robot || p.health.downed || p.faction !== "colony") return false;
  const pn = pain(game, p), bl = p.health.bloodLoss;
  return resting ? pn > UP_PAIN || bl > UP_BLOOD : pn > REST_PAIN || bl > REST_BLOOD;
}

/** Go to a free bed and lie there while badly hurt. A bed heals faster, and doctors find the patient there. */
export function bedRestJob(game: Game, p: Pawn): Job | null {
  // A free medical bed first, else the survivor's own bed.
  const bed = freeBed(game, p, p)?.id ?? findBed(game, p);
  if (bed === null || !reserve(game, `thing:${bed}`, p)) return null;
  const t = game.things.get(bed)!;
  return { kind: "bedrest", stage: 0, target: { layer: t.layer, x: t.x, y: t.y } };
}

registerJob("bedrest", (game, p, job) => {
  if (job.stage === 0) {
    if (!goTo(game, p, job.target!)) return "fail";
    job.stage = 1;
  }
  if (job.stage === 1) {
    if (!atGoal(p)) return "run";
    p.asleep = true;
    job.stage = 2;
  }
  // Get up for water or food (when there is food), or once well enough.
  const hungry = p.needs.hunger < 0.25 && (game.tick + p.id) % 30 === 0 && findItem(game, p, (d) => game.reg.items.list[d].category === "food") !== null;
  if (p.needs.thirst < 0.25 || hungry || !needsBedRest(game, p, true)) {
    p.asleep = false;
    return "done";
  }
  return "run";
});

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
  // Wake for hunger only when there is food to eat: else a starving, exhausted survivor wakes,
  // finds nothing, falls asleep again at once, and never rests or works (they would starve next to ripe crops).
  const hungry = p.needs.hunger < 0.2 && (game.tick + p.id) % 30 === 0 && findItem(game, p, (d) => game.reg.items.list[d].category === "food") !== null;
  const urgent = p.needs.thirst < 0.2 || hungry;
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

/**
 * How well a tile keeps a radiation cloud out (user: "strive to be in a room with an airlock, or the
 * bunker"): 2 sealed (an airlock or a closed hall) or underground, 1 roofed but a door opens outside,
 * 0 open sky.
 */
export function shelterRank(game: Game, layer: number, x: number, y: number): number {
  if (game.map.layers[layer].underground) return 2;
  const e = exposureAt(game, layer, x, y);
  return e === "sealed" ? 2 : e === "leaky" ? 1 : 0;
}

/** Survivors who found nothing better stay put for a while (no dropping work again and again). */
const noBetterShelter = new WeakMap<Game, Map<number, number>>();

export function sheltered(game: Game, p: Pawn): boolean {
  if (shelterRank(game, p.layer, p.x, p.y) >= 2) return true;
  return (noBetterShelter.get(game)?.get(p.id) ?? -1) > game.tick;
}

/**
 * The best shelter in reach: a sealed room on this floor (searched outward by walking), else underground
 * through the stairs (caves, bunker), else any roof. Only a better place than where the survivor stands.
 */
function shelterJob(game: Game, p: Pawn): Job | null {
  const here = shelterRank(game, p.layer, p.x, p.y);
  const L = game.map.layers[p.layer];
  const seen = new Set<number>([L.i(p.x, p.y)]);
  let frontier: [number, number][] = [[p.x, p.y]];
  let roofed: Pos | null = null;
  const take = (pos: Pos): Job => {
    reserve(game, `tile:${pos.layer},${pos.x},${pos.y}`, p);
    return { kind: "shelter", stage: 0, target: pos };
  };
  for (let steps = 0; steps < 80 && frontier.length; steps++) {
    const next: [number, number][] = [];
    for (const [x, y] of frontier) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (!game.walkable(p.layer, nx, ny)) continue;
        const i = L.i(nx, ny);
        if (seen.has(i)) continue;
        seen.add(i);
        if (!isReserved(game, `tile:${p.layer},${nx},${ny}`, p)) {
          const r = shelterRank(game, p.layer, nx, ny);
          if (r === 2) return take({ layer: p.layer, x: nx, y: ny });
          if (r === 1 && !roofed) roofed = { layer: p.layer, x: nx, y: ny };
        }
        next.push([nx, ny]);
      }
    }
    frontier = next;
  }
  // No sealed room near: go below ground, to a free spot by the stairs up in the caves.
  if (!L.underground) {
    for (const st of game.things.values()) {
      if (game.reg.things.list[st.def].id !== "stairs_up" || !game.map.layers[st.layer].underground) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1], [2, 0], [-2, 0], [0, 2], [0, -2]]) {
        const pos = { layer: st.layer, x: st.x + dx, y: st.y + dy };
        if (!game.walkable(pos.layer, pos.x, pos.y) || isReserved(game, `tile:${pos.layer},${pos.x},${pos.y}`, p)) continue;
        if (game.path.canReach(p, pos)) return take(pos);
      }
    }
  }
  if (roofed && here < 1) return take(roofed);
  // Nothing better than here: stay and keep working for a while.
  const m = noBetterShelter.get(game) ?? new Map<number, number>();
  m.set(p.id, game.tick + 300);
  noBetterShelter.set(game, m);
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
