/**
 * Needs, mood and mental breaks (spec 01). Called once per tick per pawn.
 */
import type { Game } from "./game.ts";
import { addMemory, hasTraitFlag, NEED_DECAY, type Pawn } from "./pawn.ts";

/** Hours of ground sleep to refill rest from 0 to 1. A bed is faster (M3). */
const SLEEP_HOURS = 8;
export const GROUND_SLEEP_EFFICIENCY = 0.8;
const MOOD_EVERY = 30;
/** Mood moves toward its target by at most this much per mood update. */
const MOOD_STEP = 0.5;
export const BREAK_THRESHOLD = 35;

export function tickNeeds(game: Game, p: Pawn): void {
  const perTick = 1 / game.ticksPerDay;
  p.needs.hunger = Math.max(0, p.needs.hunger - NEED_DECAY.hunger * perTick);
  p.needs.thirst = Math.max(0, p.needs.thirst - NEED_DECAY.thirst * perTick);
  if (p.asleep) {
    const eff = typeof p.job?.data?.efficiency === "number" ? p.job.data.efficiency : GROUND_SLEEP_EFFICIENCY;
    p.needs.rest = Math.min(1, p.needs.rest + eff / (SLEEP_HOURS * game.ticksPerHour));
  } else {
    p.needs.rest = Math.max(0, p.needs.rest - NEED_DECAY.rest * perTick);
  }

  if ((game.tick + p.id) % MOOD_EVERY === 0) updateMood(game, p);
  if ((game.tick + p.id * 7) % Math.round(game.ticksPerHour) === 0) checkBreak(game, p);
}

function situational(game: Game, p: Pawn): string[] {
  const out: string[] = [];
  const { hunger, thirst, rest } = p.needs;
  if (hunger <= 0) out.push("starving");
  else if (hunger < 0.25) out.push("hungry");
  if (thirst <= 0) out.push("dehydrated");
  else if (thirst < 0.25) out.push("thirsty");
  if (rest < 0.05) out.push("exhausted");
  else if (rest < 0.25) out.push("tired");
  return out;
}

export function moodTarget(game: Game, p: Pawn): number {
  let m = 50;
  for (const t of p.traits) m += game.reg.traits.list[t].mood;
  for (const ti of p.situational) m += game.reg.thoughts.list[ti].mood;
  for (const mem of p.memories) m += game.reg.thoughts.list[mem.thought].mood;
  return Math.max(0, Math.min(100, m));
}

export function updateMood(game: Game, p: Pawn): void {
  p.memories = p.memories.filter((m) => m.expires > game.tick);
  p.situational = situational(game, p).map((id) => game.reg.thoughts.idx(id));
  const target = moodTarget(game, p);
  p.mood += Math.max(-MOOD_STEP, Math.min(MOOD_STEP, target - p.mood));
}

function checkBreak(game: Game, p: Pawn): void {
  if (p.mentalBreak) {
    if (game.tick >= p.mentalBreak.until) {
      p.mentalBreak = null;
      addMemory(game, p, "sulked");
      game.message("msg.break_end", { name: p.nick });
    }
    return;
  }
  if (p.mood >= BREAK_THRESHOLD) return;
  const chance = ((BREAK_THRESHOLD - p.mood) / BREAK_THRESHOLD) * 0.15;
  if (!game.aiRng.chance(chance)) return;
  // The AI loop ends the current job on its next tick (see tickPawns).
  p.mentalBreak = { kind: "sulk", until: game.tick + Math.round(game.aiRng.int(3, 6) * game.ticksPerHour) };
  game.message("msg.break_sulk", { name: p.nick }, "warn");
}

/** True when the pawn's schedule says sleep. Night owls sleep during the day. */
export function isSleepTime(game: Game, p: Pawn): boolean {
  const h = game.hourOfDay;
  if (hasTraitFlag(game, p, "night_owl")) return h >= 10 && h < 18;
  return h >= 22 || h < 6;
}
