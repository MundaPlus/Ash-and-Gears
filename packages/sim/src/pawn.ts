/**
 * Survivors ("pawns"): identity, skills, traits, needs and mood thoughts.
 * See docs/spec/01-colonists.md.
 */
import type { Game } from "./game.ts";
import type { ItemStack } from "./map.ts";
import type { Pos } from "./path.ts";

export const NEEDS = ["hunger", "thirst", "rest"] as const;
export type NeedId = (typeof NEEDS)[number];

/** Need drop per in-game day (1 = full bar). Rest drops only while awake. */
export const NEED_DECAY: Record<NeedId, number> = { hunger: 0.9, thirst: 1.4, rest: 1.5 };

export type Passion = 0 | 1 | 2;
export interface Skill {
  level: number;
  xp: number;
  passion: Passion;
}

export interface Memory {
  /** Index into Registry.thoughts. */
  thought: number;
  expires: number;
}

export interface Job {
  kind: string;
  stage: number;
  /** Target tile. */
  target?: Pos;
  /** Target entity (item stack, thing). */
  targetId?: number;
  /** Tick when the current stage ends. */
  until?: number;
  /** Job-specific extra data. */
  data?: Record<string, number | string | boolean>;
}

export interface MentalBreak {
  kind: "sulk";
  until: number;
}

export interface Pawn {
  id: number;
  first: string;
  last: string;
  nick: string;
  age: number;
  layer: number;
  x: number;
  y: number;
  /** Remaining path (next tile first). */
  path: Pos[] | null;
  /** Where the current path leads. Used to plan again when the way gets blocked. */
  goal: { pos: Pos; adjacent: boolean } | null;
  /** Progress toward path[0], 0..1. */
  moveT: number;
  /** -1 = facing left, 1 = right. */
  facing: number;
  needs: Record<NeedId, number>;
  memories: Memory[];
  /** Situational thoughts, refreshed by the needs system. Indexes into Registry.thoughts. */
  situational: number[];
  mood: number;
  mentalBreak: MentalBreak | null;
  skills: Skill[];
  /** Indexes into Registry.traits. */
  traits: number[];
  job: Job | null;
  /** Ticks to wait before the next job search after a failed one. */
  thinkCooldown: number;
  asleep: boolean;
  carrying: ItemStack | null;
}

export const XP_PER_LEVEL = (level: number) => 1000 + level * 250;
const PASSION_MULT = [0.35, 1, 1.5];

export function pawnName(p: Pawn): string {
  return `${p.first} "${p.nick}" ${p.last}`;
}

/** Skill level with trait bonuses, clamped 0..20. */
export function skillLevel(game: Game, p: Pawn, skillId: string): number {
  const si = game.reg.skills.idx(skillId);
  let lvl = p.skills[si].level;
  for (const t of p.traits) lvl += game.reg.traits.list[t].skillBonus[skillId] ?? 0;
  return Math.max(0, Math.min(20, lvl));
}

export function learn(game: Game, p: Pawn, skillId: string, xp: number): void {
  const s = p.skills[game.reg.skills.idx(skillId)];
  if (s.level >= 20) return;
  s.xp += xp * PASSION_MULT[s.passion];
  while (s.xp >= XP_PER_LEVEL(s.level) && s.level < 20) {
    s.xp -= XP_PER_LEVEL(s.level);
    s.level++;
    game.message("msg.skill_up", { name: p.nick, skill: skillId, level: s.level });
  }
}

export function hasTraitFlag(game: Game, p: Pawn, flag: string): boolean {
  return p.traits.some((t) => game.reg.traits.list[t].flags.includes(flag));
}

export function workSpeed(game: Game, p: Pawn): number {
  let m = 1;
  for (const t of p.traits) m *= game.reg.traits.list[t].workSpeed;
  if (p.needs.rest < 0.1) m *= 0.7;
  return m;
}

/** Add a memory thought, respecting its stack limit (the oldest copy is replaced). */
export function addMemory(game: Game, p: Pawn, thoughtId: string): void {
  const ti = game.reg.thoughts.idx(thoughtId);
  const def = game.reg.thoughts.list[ti];
  const expires = game.tick + Math.round((def.hours ?? 6) * game.ticksPerHour);
  const same = p.memories.filter((m) => m.thought === ti);
  if (same.length >= def.stack) {
    same.sort((a, b) => a.expires - b.expires);
    same[0].expires = expires;
    return;
  }
  p.memories.push({ thought: ti, expires });
}

/** Make a new random survivor. */
export function makeSurvivor(game: Game, layer: number, x: number, y: number, usedNames: Set<string>): Pawn {
  const rng = game.rng.fork(`pawn${game.pawns.size}`);
  const names = game.reg.content.names;
  let first = rng.pick(names.first), nick = rng.pick(names.nick);
  for (let i = 0; i < 20 && (usedNames.has(first) || usedNames.has(nick)); i++) {
    first = rng.pick(names.first);
    nick = rng.pick(names.nick);
  }
  usedNames.add(first);
  usedNames.add(nick);

  const skills: Skill[] = game.reg.skills.list.map(() => ({ level: rng.int(0, 8), xp: 0, passion: 0 as Passion }));
  // A few strong skills with passion make each survivor useful for something.
  for (let i = 0; i < 2; i++) {
    const s = skills[rng.int(0, skills.length - 1)];
    s.level = Math.min(20, s.level + rng.int(4, 8));
    s.passion = rng.chance(0.4) ? 2 : 1;
  }

  const traits: number[] = [];
  const want = rng.int(1, 3);
  for (let tries = 0; traits.length < want && tries < 30; tries++) {
    const ti = rng.int(0, game.reg.traits.list.length - 1);
    const def = game.reg.traits.list[ti];
    if (traits.includes(ti)) continue;
    if (traits.some((t) => def.conflicts.includes(game.reg.traits.list[t].id))) continue;
    traits.push(ti);
  }

  return {
    id: game.newId(),
    first,
    last: rng.pick(names.last),
    nick,
    age: rng.int(18, 64),
    layer,
    x,
    y,
    path: null,
    goal: null,
    moveT: 0,
    facing: 1,
    needs: { hunger: 0.8 + rng.next() * 0.2, thirst: 0.8 + rng.next() * 0.2, rest: 0.8 + rng.next() * 0.2 },
    memories: [],
    situational: [],
    mood: 50,
    mentalBreak: null,
    skills,
    traits,
    job: null,
    thinkCooldown: 0,
    asleep: false,
    carrying: null,
  };
}
