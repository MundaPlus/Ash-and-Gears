/**
 * Health (spec 01 "Health", demo subset): hit points per body region, injuries that bleed and hurt,
 * blood loss, downed state and death. Starvation, dehydration and radiation also damage the body.
 */
import type { Game } from "./game.ts";
import { dropItems } from "./items.ts";
import { addMemory, pawnName, type Pawn } from "./pawn.ts";

export const PARTS = ["head", "torso", "l_arm", "r_arm", "l_leg", "r_leg"] as const;
export type PartId = (typeof PARTS)[number];
const PART_HP: Record<PartId, number> = { head: 25, torso: 40, l_arm: 20, r_arm: 20, l_leg: 25, r_leg: 25 };
/** Where hits land. */
const PART_WEIGHT: Record<PartId, number> = { head: 0.1, torso: 0.4, l_arm: 0.12, r_arm: 0.12, l_leg: 0.13, r_leg: 0.13 };
const VITAL: PartId[] = ["head", "torso"];

/** Damage kinds: pain factor and bleeding per point of damage per in-game hour. */
const KIND: Record<string, { pain: number; bleed: number }> = {
  cut: { pain: 1, bleed: 0.004 },
  blunt: { pain: 0.8, bleed: 0 },
  gunshot: { pain: 1.2, bleed: 0.005 },
  arrow: { pain: 1.1, bleed: 0.0045 },
  bite: { pain: 1.1, bleed: 0.0032 },
  burn: { pain: 1.4, bleed: 0 },
  starvation: { pain: 0.3, bleed: 0 },
  dehydration: { pain: 0.4, bleed: 0 },
  radiation: { pain: 0.6, bleed: 0 },
};

export interface Injury {
  part: PartId;
  kind: string;
  dmg: number;
  /** 0 = untended, else tend quality 0.1..1. */
  tended: number;
  /** In-game hours since the wound. Wounds clot over time. */
  age?: number;
}

export interface Health {
  injuries: Injury[];
  missing: PartId[];
  /** 0..1. 0.5 downs a pawn, 1 kills. */
  bloodLoss: number;
  downed: boolean;
}

export function newHealth(): Health {
  return { injuries: [], missing: [], bloodLoss: 0, downed: false };
}

export function partMax(game: Game, p: Pawn, part: PartId): number {
  return PART_HP[part] * game.reg.content.creatures[p.creature].hp;
}

export function partDamage(p: Pawn, part: PartId): number {
  let d = 0;
  for (const i of p.health.injuries) if (i.part === part) d += i.dmg;
  return d;
}

/** 0..1 pain from all injuries. */
export function pain(game: Game, p: Pawn): number {
  let s = 0;
  for (const i of p.health.injuries) s += i.dmg * (KIND[i.kind]?.pain ?? 1);
  return Math.min(1, s / (90 * game.reg.content.creatures[p.creature].hp));
}

/** Hours until an untended wound stops bleeding on its own. */
const CLOT_HOURS = 8;

/** Bleeding in blood-loss per in-game hour. Wounds clot over time; tending stops most bleeding. */
export function bleedRate(p: Pawn): number {
  let r = 0;
  for (const i of p.health.injuries) {
    const b = (KIND[i.kind]?.bleed ?? 0) * i.dmg * Math.max(0, 1 - (i.age ?? 0) / CLOT_HOURS);
    r += i.tended ? b * (1 - i.tended) * 0.25 : b;
  }
  // Fair but dangerous (spec 12): lying still halves bleeding, and near death the body slows it
  // again, so a rescue after the fight usually comes in time.
  if (p.health.downed) r *= 0.5;
  if (p.health.bloodLoss > 0.8) r *= 0.5;
  return r;
}

/** Walking speed multiplier from legs and pain. */
export function moving(game: Game, p: Pawn): number {
  if (p.health.downed) return 0;
  let m = 1;
  for (const leg of ["l_leg", "r_leg"] as PartId[]) {
    if (p.health.missing.includes(leg)) m -= 0.4;
    else m -= 0.3 * Math.min(1, partDamage(p, leg) / partMax(game, p, leg));
  }
  m -= pain(game, p) * 0.3;
  return Math.max(0.15, m);
}

/** Work and attack speed multiplier from arms and pain. */
export function manipulation(game: Game, p: Pawn): number {
  let m = 1;
  for (const arm of ["l_arm", "r_arm"] as PartId[]) {
    if (p.health.missing.includes(arm)) m -= 0.4;
    else m -= 0.25 * Math.min(1, partDamage(p, arm) / partMax(game, p, arm));
  }
  return Math.max(0.1, m - pain(game, p) * 0.2);
}

function pickPart(game: Game, p: Pawn): PartId {
  const parts = PARTS.filter((x) => !p.health.missing.includes(x));
  let total = 0;
  for (const x of parts) total += PART_WEIGHT[x];
  let r = game.aiRng.next() * total;
  for (const x of parts) {
    r -= PART_WEIGHT[x];
    if (r <= 0) return x;
  }
  return "torso";
}

/** Hurt a pawn. Returns the part hit. */
export function damage(game: Game, p: Pawn, dmg: number, kind: string, part?: PartId): PartId {
  const where = part ?? pickPart(game, p);
  const amount = dmg * (0.75 + game.aiRng.next() * 0.5);
  // Small wounds of the same kind on the same part merge (starvation, radiation, burns).
  const same = kind === "starvation" || kind === "dehydration" || kind === "radiation" ? p.health.injuries.find((i) => i.part === where && i.kind === kind) : undefined;
  if (same) same.dmg += amount;
  else p.health.injuries.push({ part: where, kind, dmg: amount, tended: 0 });
  checkParts(game, p, where, kind);
  return where;
}

function checkParts(game: Game, p: Pawn, part: PartId, kind: string) {
  if (!game.pawns.has(p.id)) return;
  if (partDamage(p, part) < partMax(game, p, part)) return updateDowned(game, p);
  if (VITAL.includes(part)) {
    // Fair but dangerous (spec 12): a survivor who is still standing goes down instead of dying,
    // unless the single blow is huge. A second bad hit, or one while downed, still kills.
    const last = p.health.injuries[p.health.injuries.length - 1];
    const max = partMax(game, p, part);
    if (p.faction === "colony" && !p.health.downed && last && last.part === part && last.dmg < max * 0.6) {
      last.dmg = Math.max(0, last.dmg - (partDamage(p, part) - (max - 0.5)));
      p.health.downed = true;
      game.message("msg.downed", { name: p.nick }, "bad");
      return;
    }
    return kill(game, p, kind);
  }
  // A destroyed limb is lost for good.
  p.health.missing.push(part);
  p.health.injuries = p.health.injuries.filter((i) => i.part !== part);
  p.health.injuries.push({ part: "torso", kind: "cut", dmg: 4, tended: 0 });
  if (p.faction === "colony") game.message("msg.lost_limb", { name: p.nick, part }, "bad");
  updateDowned(game, p);
}

function updateDowned(game: Game, p: Pawn) {
  const legs = p.health.missing.filter((x) => x === "l_leg" || x === "r_leg").length;
  const was = p.health.downed;
  p.health.downed = p.health.bloodLoss > 0.6 || pain(game, p) > 0.85 || legs >= 2;
  if (p.health.downed && !was) {
    p.path = null;
    p.asleep = false;
    if (p.faction === "colony") game.message("msg.downed", { name: p.nick }, "bad");
  }
}

export function kill(game: Game, p: Pawn, cause: string): void {
  if (!game.pawns.has(p.id)) return;
  game.pawns.delete(p.id);
  for (const [k, v] of game.reservations) if (v === p.id) game.reservations.delete(k);
  const creature = game.reg.content.creatures[p.creature];
  if (creature.behavior === "human") dropItems(game, "corpse", 1, p.layer, p.x, p.y);
  else if (creature.meat > 0) dropItems(game, "mutant_meat", creature.meat, p.layer, p.x, p.y);
  if (p.weapon !== null) dropItems(game, p.weapon, 1, p.layer, p.x, p.y);
  if (p.carrying) dropItems(game, p.carrying.def, p.carrying.count, p.layer, p.x, p.y);
  if (p.faction === "colony") {
    game.message("msg.died", { name: pawnName(p), cause }, "bad");
    for (const o of game.pawns.values()) if (o.faction === "colony") addMemory(game, o, "colonist_died");
  }
  game.deaths.push({ id: p.id, name: p.nick, faction: p.faction, tick: game.tick, cause });
}

/** Once per in-game hour: bleeding, healing, starvation, dehydration, radiation. */
export function tickHealthHourly(game: Game, p: Pawn, inBed: boolean): void {
  const h = p.health;
  const bleed = bleedRate(p);
  h.bloodLoss = Math.max(0, h.bloodLoss + bleed - 0.15 / 24);
  for (const i of h.injuries) i.age = (i.age ?? 0) + 1;
  if (h.bloodLoss >= 1) return kill(game, p, "blood_loss");

  if (p.faction === "colony" || p.faction === "raiders") {
    // Torso has 40 HP: about 3 days without food, under 2 days without water.
    if (p.needs.hunger <= 0) damage(game, p, 0.5, "starvation", "torso");
    if (p.needs.thirst <= 0) damage(game, p, 1, "dehydration", "torso");
    if (p.rad >= 1) damage(game, p, 1, "radiation", "torso");
    if (!game.pawns.has(p.id)) return;
  }

  // Healing per hour. Starvation/dehydration/radiation heal only once the cause is gone.
  const bedMult = inBed ? 1.5 : 1;
  for (const i of h.injuries) {
    if (i.kind === "starvation" && p.needs.hunger <= 0) continue;
    if (i.kind === "dehydration" && p.needs.thirst <= 0) continue;
    if (i.kind === "radiation" && p.rad >= 0.6) continue;
    const perDay = i.tended ? 1.5 * (1 + i.tended) : 0.5;
    i.dmg -= (perDay * bedMult) / 24;
  }
  h.injuries = h.injuries.filter((i) => i.dmg > 0.05);
  updateDowned(game, p);
}

export function untendedInjuries(p: Pawn): Injury[] {
  return p.health.injuries.filter((i) => !i.tended && KIND[i.kind]?.bleed !== undefined && !["starvation", "dehydration", "radiation"].includes(i.kind));
}

export function addInPainThought(game: Game, p: Pawn, out: string[]): void {
  if (pain(game, p) > 0.3) out.push("in_pain");
}
