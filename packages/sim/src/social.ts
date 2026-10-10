/**
 * Relationships (spec 12, Alpha A5). Each survivor has an opinion (-100..100) of each other survivor.
 * Opinions move with talks (chance each hour when two awake survivors are close), rescues and raids
 * survived together. Friends are at 40 or more, rivals at -40 or less. Two close friends can become
 * lovers. Some starting survivors are family. Friends, rivals and lovers add mood thoughts; a death
 * hurts the friends, family and lover left behind.
 */
import type { Game } from "./game.ts";
import { addMemory, learn, skillLevel, traitMult, type Pawn } from "./pawn.ts";

export const FRIEND_AT = 40;
export const RIVAL_AT = -40;
const LOVER_AT = 70;
/** Tiles apart for a talk. */
const TALK_RANGE = 4;
/** Chance per in-game hour that two survivors in range talk. */
const TALK_CHANCE = 0.25;

export type Bond = "family" | "lover";

const key = (a: number, b: number) => `${a}>${b}`;
const pair = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);

/** What `a` thinks of `b`. */
export function opinion(game: Game, a: Pawn, b: Pawn): number {
  return game.opinions.get(key(a.id, b.id)) ?? 0;
}

export function changeOpinion(game: Game, a: Pawn, b: Pawn, delta: number): void {
  if (a.id === b.id) return;
  game.opinions.set(key(a.id, b.id), Math.max(-100, Math.min(100, opinion(game, a, b) + delta)));
}

export function bondOf(game: Game, a: Pawn, b: Pawn): Bond | undefined {
  return game.bonds.get(pair(a.id, b.id));
}

export function setBond(game: Game, a: Pawn, b: Pawn, bond: Bond): void {
  game.bonds.set(pair(a.id, b.id), bond);
}

/** Label for the UI: lover, family, friend, rival or acquaintance. */
export function relationLabel(game: Game, a: Pawn, b: Pawn): "lover" | "family" | "friend" | "rival" | "acquaintance" {
  const bond = bondOf(game, a, b);
  if (bond) return bond;
  const o = opinion(game, a, b);
  return o >= FRIEND_AT ? "friend" : o <= RIVAL_AT ? "rival" : "acquaintance";
}

/** People only: robots have no social life. */
const colonists = (game: Game) => [...game.pawns.values()].filter((p) => p.faction === "colony" && !p.robot);
const awake = (p: Pawn) => !p.health.downed && !p.asleep && !p.drafted;

/** Once per in-game hour: survivors close to each other may talk. */
export function tickSocial(game: Game): void {
  if (game.tick % Math.round(game.ticksPerHour) !== 0) return;
  const cols = colonists(game).filter(awake);
  const rng = game.aiRng;
  for (let i = 0; i < cols.length; i++)
    for (let j = i + 1; j < cols.length; j++) {
      const a = cols[i], b = cols[j];
      if (a.layer !== b.layer || Math.hypot(a.x - b.x, a.y - b.y) > TALK_RANGE || !rng.chance(TALK_CHANCE)) continue;
      talk(game, a, b, rng.next());
    }
}

/** One talk. `roll` 0..1 sets how well it goes; social skill helps. */
export function talk(game: Game, a: Pawn, b: Pawn, roll: number): void {
  const skill = (skillLevel(game, a, "social") + skillLevel(game, b, "social")) / 2;
  const base = -3 + roll * 9 + skill / 5;
  for (const [x, y] of [[a, b], [b, a]] as const) {
    const gain = base > 0 ? traitMult(game, x, (t) => t.opinionGain) * traitMult(game, y, (t) => t.likability) : 1;
    changeOpinion(game, x, y, base * gain);
    addMemory(game, x, base > 0 ? "had_chat" : "had_argument");
    learn(game, x, "social", 0.3);
  }
  // Two people who like each other a lot may become a couple.
  if (
    base > 0 && !bondOf(game, a, b) && a.age >= 18 && b.age >= 18 &&
    opinion(game, a, b) >= LOVER_AT && opinion(game, b, a) >= LOVER_AT &&
    !hasLover(game, a) && !hasLover(game, b) && game.aiRng.chance(0.1)
  ) {
    setBond(game, a, b, "lover");
    game.message("msg.new_lovers", { a: a.nick, b: b.nick }, "info");
  }
}

function hasLover(game: Game, p: Pawn): boolean {
  return colonists(game).some((o) => o.id !== p.id && bondOf(game, p, o) === "lover");
}

/** Social thoughts that exist while the condition holds (called by the needs system). */
export function socialThoughts(game: Game, p: Pawn): string[] {
  const out: string[] = [];
  let friend = false, rival = false, lover = false;
  for (const o of colonists(game)) {
    if (o.id === p.id) continue;
    const label = relationLabel(game, p, o);
    if (label === "lover") lover = true;
    else if (label === "friend" || (label === "family" && opinion(game, p, o) >= 0)) friend = true;
    if (opinion(game, p, o) <= RIVAL_AT) rival = true;
  }
  if (lover) out.push("has_lover");
  if (friend) out.push("has_friend");
  if (rival) out.push("has_rival");
  return out;
}

/** A survivor died: those close to them grieve (or not). */
export function onDeath(game: Game, dead: Pawn): void {
  if (dead.robot) return;
  for (const o of colonists(game)) {
    if (o.id === dead.id) continue;
    const label = relationLabel(game, o, dead);
    if (label === "lover") addMemory(game, o, "lover_died");
    else if (label === "family") addMemory(game, o, "family_died");
    else if (label === "friend") addMemory(game, o, "friend_died");
    else if (label === "rival") addMemory(game, o, "rival_died");
  }
}

/** Shared events: everyone who lived through it likes the others a bit more. */
export function sharedEvent(game: Game, amount: number): void {
  const cols = colonists(game);
  for (const a of cols) for (const b of cols) if (a.id !== b.id) changeOpinion(game, a, b, amount);
}

/** At the start: maybe two survivors are siblings (same last name, a good opinion of each other). */
export function makeFamily(game: Game, cols: Pawn[]): void {
  if (cols.length < 2 || !game.rng.fork("family").chance(0.4)) return;
  const [a, b] = cols;
  b.last = a.last;
  setBond(game, a, b, "family");
  changeOpinion(game, a, b, 30);
  changeOpinion(game, b, a, 30);
}
