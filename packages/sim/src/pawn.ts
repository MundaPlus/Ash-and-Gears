/**
 * Survivors ("pawns"): identity, skills, traits, needs and mood thoughts.
 * See docs/spec/01-colonists.md.
 */
import type { TraitDef } from "@wc/data";
import type { Game } from "./game.ts";
import type { ItemStack } from "./map.ts";
import type { Pos } from "./path.ts";
import { manipulation, newHealth, type Health } from "./health.ts";

export type Faction = "colony" | "raiders" | "wild" | "prisoner" | "visitor" | "trader";

/** Player orders for drafted survivors. */
export type Order = { kind: "move"; pos: Pos } | { kind: "attack"; target: number };

export const NEEDS = ["hunger", "thirst", "rest", "fun"] as const;
export type NeedId = (typeof NEEDS)[number];

/** Need drop per in-game day (1 = full bar). Rest drops only while awake. */
export const NEED_DECAY: Record<NeedId, number> = { hunger: 0.9, thirst: 1.2, rest: 1.5, fun: 0.6 };

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
  /** Tick when the job started (set by the AI loop). */
  started?: number;
  /** Target tile. */
  target?: Pos;
  /** Target entity (item stack, thing). */
  targetId?: number;
  /** Tick when the current stage ends. */
  until?: number;
  /** Job-specific extra data. */
  data?: Record<string, number | string | boolean>;
  /** The work type this job came from ("idle" for orders a survivor gave itself). Higher work may take over. */
  workType?: string;
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
  /** Backstory: [childhood, adulthood] indexes into Registry.backstories (A5). */
  backstory?: [number, number];
  /** Work types this survivor will not do (from the backstory). */
  noWork?: string[];
  job: Job | null;
  /** Ticks to wait before the next job search after a failed one. */
  thinkCooldown: number;
  asleep: boolean;
  carrying: ItemStack | null;
  /** Work priority per work type: 0 = off, 1 = highest .. 4 = lowest. */
  work: Record<string, number>;
  /** Bed this survivor owns, if any. */
  bedId: number | null;
  /** Radiation dose. 0.3 = sick, 0.6 = nausea, 1 = organ damage, 1.5 = lethal. */
  rad: number;
  /** Index into content.creatures ("human" for survivors and raiders). */
  creature: number;
  faction: Faction;
  health: Health;
  drafted: boolean;
  order: Order | null;
  /** Equipped weapon (item index), or null for fists / natural attack. */
  weapon: number | null;
  /** Worn armor (item indices): at most one for the body and one for the head (N2). */
  armor: number[];
  /** Ticks until the next attack. */
  cooldown: number;
  /** Raid or pack this hostile belongs to. */
  group: number | null;
  /** Last pawn that hit this one. */
  lastAttacker?: number;
  /** Colony robot or drone (A7): no needs, mood or social life. */
  robot?: boolean;
  /** Food poisoning until this tick: slower work. */
  sickUntil?: number;
  /** Daily schedule (B9): 24 slots "any" | "work" | "sleep" | "joy". Absent = the default day. */
  schedule?: ("any" | "work" | "sleep" | "joy")[];
  /** Robot charge 0..1. */
  charge?: number;
  /** A guard robot that drafted itself (B6); the player's own drafting is left alone. */
  guarding?: boolean;
  /** Tick raiders hacked this robot (B6); it fights for them until the hack wears off. */
  hackedAt?: number;
  /** What this survivor did, for the ending slides (Beta). */
  stats?: { kills?: number; rescues?: number; built?: number; crafted?: number };
  /** Named faction this raider, trader or prisoner belongs to (A9). */
  origin?: string;
  /** Downed raider marked for capture (A6). */
  capture?: boolean;
  /** Prisoner: resistance to recruiting; 0 = ready to be asked (A6). */
  resistance?: number;
  /** Prisoner: tick of the last warden talk. */
  lastTalk?: number;
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
  for (const b of p.backstory ?? []) lvl += game.reg.backstories.list[b].skillBonus[skillId] ?? 0;
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

export function radMult(game: Game, p: Pawn): number {
  let m = 1;
  for (const t of p.traits) m *= game.reg.traits.list[t].radMult;
  return m;
}

export function addRad(game: Game, p: Pawn, dose: number): void {
  p.rad = Math.min(1.5, p.rad + dose * radMult(game, p));
}

export function workSpeed(game: Game, p: Pawn): number {
  let m = 1;
  for (const t of p.traits) m *= game.reg.traits.list[t].workSpeed;
  if (p.needs.rest < 0.1) m *= 0.7;
  if (p.rad >= 0.6) m *= 0.8;
  if ((p.sickUntil ?? 0) > game.tick) m *= 0.75;
  return m * manipulation(game, p);
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
  const rng = game.rng.fork(`pawn${game.pawns.size}:${game.tick}:${game.deaths.length}`);
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

  // Backstory: one from before the war, one from after.
  const kids = game.reg.backstories.list.map((b, i) => [b, i] as const).filter(([b]) => b.stage === "childhood");
  const adults = game.reg.backstories.list.map((b, i) => [b, i] as const).filter(([b]) => b.stage === "adulthood");
  const backstory: [number, number] | undefined = kids.length && adults.length ? [rng.pick(kids)[1], rng.pick(adults)[1]] : undefined;
  const noWork = backstory ? [...new Set(backstory.flatMap((b) => game.reg.backstories.list[b].workDisabled))] : [];

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
    needs: { hunger: 0.8 + rng.next() * 0.2, thirst: 0.8 + rng.next() * 0.2, rest: 0.8 + rng.next() * 0.2, fun: 0.7 + rng.next() * 0.2 },
    memories: [],
    situational: [],
    mood: 50,
    mentalBreak: null,
    skills,
    traits,
    ...(backstory ? { backstory } : {}),
    ...(noWork.length ? { noWork } : {}),
    job: null,
    thinkCooldown: 0,
    asleep: false,
    carrying: null,
    work: {},
    bedId: null,
    rad: 0,
    creature: game.reg.content.creatures.findIndex((c) => c.id === "human"),
    faction: "colony",
    health: newHealth(),
    drafted: false,
    order: null,
    weapon: null,
    armor: [],
    cooldown: 0,
    group: null,
  };
}

/** A hostile: a raider (human with a weapon) or a creature (rat, hound). */
export function makeHostile(game: Game, creatureId: string, faction: Faction, layer: number, x: number, y: number, group: number, weapon: string | null): Pawn {
  const used = new Set<string>();
  const p = makeSurvivor(game, layer, x, y, used);
  p.creature = game.reg.content.creatures.findIndex((c) => c.id === creatureId);
  p.faction = faction;
  p.group = group;
  p.weapon = weapon ? game.reg.items.idx(weapon) : null;
  p.traits = [];
  delete p.backstory;
  delete p.noWork;
  p.memories = [];
  p.needs = { hunger: 1, thirst: 1, rest: 1, fun: 1 };
  if (creatureId !== "human") {
    p.first = "";
    p.last = "";
    p.nick = creatureId;
  }
  return p;
}

/** Product of a numeric trait field over the survivor's traits (1 when none set it). */
export function traitMult(game: Game, p: Pawn, pick: (t: TraitDef) => number): number {
  let m = 1;
  for (const t of p.traits) m *= pick(game.reg.traits.list[t]);
  return m;
}

/** Count a deed for the ending slides. */
export function addStat(p: Pawn, k: "kills" | "rescues" | "built" | "crafted", n = 1): void {
  p.stats = { ...(p.stats ?? {}), [k]: (p.stats?.[k] ?? 0) + n };
}
