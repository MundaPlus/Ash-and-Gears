/**
 * A character's gear and detailed stats for the Gear panel (user request): what sits in each slot, how
 * they fight, how much each damage kind their armor stops, and how fast they move and work.
 */
import { moveSpeed, WALK_SPEED } from "./ai.ts";
import { attackOf, isMelee } from "./combat.ts";
import type { Game } from "./game.ts";
import { ARMOR_KINDS, armorMove, wornIn } from "./gear.ts";
import { manipulation, moving, pain } from "./health.ts";
import { skillLevel, workSpeed, type Pawn } from "./pawn.ts";

/** Ticks per real second at normal speed (weapon cooldowns are in ticks). */
const TICKS_PER_SECOND = 60;
/** Ranged hit chance is shown for a target this far away, in the open and standing still. */
export const SHOW_RANGE = 10;

export interface GearSlots {
  head: string | null;
  body: string | null;
  weapon: string | null;
}

export interface CharStats {
  slots: GearSlots;
  attack: { melee: boolean; kind: string; dmg: number; perSecond: number; range: number; hit: number };
  /** Share stopped per damage kind (0..0.9), for the head and the body slot. */
  protection: { kind: string; head: number; body: number }[];
  /** Factors (1 = normal). */
  move: number;
  armorMove: number;
  work: number;
  moving: number;
  manipulation: number;
  pain: number;
}

export function gearSlots(game: Game, p: Pawn): GearSlots {
  const id = (i: number | undefined | null) => (i === undefined || i === null ? null : game.reg.items.list[i].id);
  return { head: id(wornIn(game, p, "head")), body: id(wornIn(game, p, "body")), weapon: id(p.weapon) };
}

export function charStats(game: Game, p: Pawn): CharStats {
  const atk = attackOf(game, p);
  const melee = isMelee(atk);
  const manip = manipulation(game, p);
  const cooldown = Math.max(1, atk.cooldown / Math.max(0.3, manip));
  const human = p.faction !== "wild";
  const hit = melee
    ? Math.min(0.95, 0.6 + (human ? skillLevel(game, p, "melee") : 8) * 0.02)
    : Math.max(0.05, Math.min(0.95, 0.45 + (human ? skillLevel(game, p, "shooting") : 6) * 0.025 + atk.accuracy - Math.max(0, Math.min(SHOW_RANGE, atk.range) - 4) * 0.018));
  const head = wornIn(game, p, "head"), body = wornIn(game, p, "body");
  const stop = (i: number | undefined, k: string) => (i === undefined ? 0 : (game.reg.items.list[i].armor as Record<string, number> | undefined)?.[k] ?? 0);
  return {
    slots: gearSlots(game, p),
    attack: { melee, kind: atk.kind, dmg: atk.dmg, perSecond: (atk.dmg / cooldown) * TICKS_PER_SECOND * hit, range: atk.range, hit },
    protection: ARMOR_KINDS.map((k) => ({ kind: k, head: stop(head, k), body: stop(body, k) })),
    move: moveSpeed(game, p) / (WALK_SPEED * game.reg.content.creatures[p.creature].speed || 1),
    armorMove: armorMove(game, p),
    work: workSpeed(game, p),
    moving: moving(game, p),
    manipulation: manip,
    pain: pain(game, p),
  };
}
