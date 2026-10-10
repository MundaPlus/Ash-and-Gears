/**
 * Recreation and schedules (Beta B9, user request). Survivors have a fun need that drops while awake.
 * They relax at joy sources: a lit campfire, a card table, a horseshoe pit (content `joy`: fun per
 * hour and seats). With no free source they take a walk, which helps less. Each survivor has a
 * 24-hour schedule: every hour is "any", "work", "sleep" or "joy".
 */
import { atGoal, goTo, isReserved, reserve } from "./ai.ts";
import type { Game } from "./game.ts";
import { registerJob } from "./jobs.ts";
import type { Thing } from "./map.ts";
import { addMemory, hasTraitFlag, type Job, type Pawn } from "./pawn.ts";
import { isLit } from "./power.ts";

export type Slot = "any" | "work" | "sleep" | "joy";
export const SLOTS: Slot[] = ["any", "work", "sleep", "joy"];

/** Fun per hour on a walk (no joy source). */
const WALK_FUN = 0.2;
/** Longest relax session (in-game hours). */
const MAX_HOURS = 2.5;

/** The default day: sleep from 22 to 6 (night owls from 10 to 18), anything else. */
export function defaultSchedule(game: Game, p: Pawn): Slot[] {
  const owl = hasTraitFlag(game, p, "night_owl");
  return Array.from({ length: 24 }, (_, h) => ((owl ? h >= 10 && h < 18 : h >= 22 || h < 6) ? "sleep" : "any"));
}

export function scheduleOf(game: Game, p: Pawn): Slot[] {
  return p.schedule ?? defaultSchedule(game, p);
}

/** The pawn's slot right now. */
export function slotNow(game: Game, p: Pawn): Slot {
  return scheduleOf(game, p)[Math.floor(game.hourOfDay) % 24];
}

/** Set one hour of a pawn's schedule. */
export function setSchedule(game: Game, p: Pawn, hour: number, slot: Slot): void {
  const s = [...scheduleOf(game, p)];
  s[((hour % 24) + 24) % 24] = slot;
  p.schedule = s;
}

/** A free seat at a joy source, nearest first. */
function joySeat(game: Game, p: Pawn): { thing: Thing; seat: number } | null {
  let best: { thing: Thing; seat: number } | null = null, bestD = Infinity;
  for (const t of game.things.values()) {
    const joy = game.reg.things.list[t.def].joy;
    if (!joy || t.layer !== p.layer || !isLit(game, t)) continue;
    const d = (t.x - p.x) ** 2 + (t.y - p.y) ** 2;
    if (d >= bestD || d > 60 * 60) continue;
    for (let k = 0; k < joy.seats; k++) {
      if (isReserved(game, `joy:${t.id}:${k}`, p)) continue;
      if (!game.path.canReachAdjacent(p, t)) break;
      best = { thing: t, seat: k };
      bestD = d;
      break;
    }
  }
  return best;
}

/** Go relax: at a joy source if one is free, else a walk. */
export function relaxJob(game: Game, p: Pawn): Job | null {
  const s = joySeat(game, p);
  if (s && reserve(game, `joy:${s.thing.id}:${s.seat}`, p))
    return { kind: "relax", stage: 0, targetId: s.thing.id, target: { layer: s.thing.layer, x: s.thing.x, y: s.thing.y }, data: { started: game.tick } };
  // A walk: somewhere open within a few tiles.
  for (let tries = 0; tries < 12; tries++) {
    const pos = { layer: p.layer, x: p.x + game.aiRng.int(-8, 8), y: p.y + game.aiRng.int(-8, 8) };
    if (game.walkable(pos.layer, pos.x, pos.y) && game.path.canReach(p, pos)) return { kind: "relax", stage: 0, target: pos, data: { started: game.tick, walk: true } };
  }
  return null;
}

registerJob("relax", (game, p, job) => {
  const walk = !!job.data?.walk;
  const src = walk ? null : game.things.get(job.targetId!);
  if (!walk && (!src || !isLit(game, src))) return "fail";
  if (job.stage === 0) {
    if (!goTo(game, p, job.target!, !walk)) return "fail";
    job.stage = 1;
  }
  if (job.stage === 1) {
    if (!atGoal(p)) return "run";
    job.stage = 2;
  }
  if (src && src.x !== p.x) p.facing = src.x > p.x ? 1 : -1;
  const rate = src ? game.reg.things.list[src.def].joy!.fun : WALK_FUN;
  p.needs.fun = Math.min(1, p.needs.fun + rate / game.ticksPerHour);
  const n = p.needs;
  const urgent = n.thirst < 0.25 || n.hunger < 0.25 || n.rest < 0.15;
  const long = game.tick - (job.data!.started as number) > MAX_HOURS * game.ticksPerHour;
  // Off the joy hours: stop once fun is fine again.
  const enough = n.fun >= 0.98 || (slotNow(game, p) !== "joy" && n.fun > 0.6);
  if (!urgent && !long && !enough) return "run";
  if (src) addMemory(game, p, "had_fun");
  return "done";
});
