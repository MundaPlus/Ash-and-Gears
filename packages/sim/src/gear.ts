/**
 * Weapon and armor tiers (N2). Armor sits in two slots: body (torso and arms, half on the legs) and
 * head. Each piece stops a share of each damage kind. Survivors swap to clearly better gear from storage.
 */
import type { ItemDef } from "@wc/data";
import type { Game } from "./game.ts";
import type { PartId } from "./health.ts";
import type { Pawn } from "./pawn.ts";

export const ARMOR_KINDS = ["cut", "blunt", "gunshot", "arrow", "bite", "burn"] as const;
type ArmorKind = (typeof ARMOR_KINDS)[number];

/** A piece of gear must be this much better (score ratio) before a survivor swaps. */
export const UPGRADE_MARGIN = 1.15;

/** The armor item a pawn wears in a slot, or undefined. */
export function wornIn(game: Game, p: Pawn, slot: "body" | "head"): number | undefined {
  return p.armor.find((a) => game.reg.items.list[a].armor?.slot === slot);
}

/** Share of a hit that armor stops on this body part (0..0.9). */
export function armorReduction(game: Game, p: Pawn, part: PartId, kind: string): number {
  if (!p.armor.length || !(ARMOR_KINDS as readonly string[]).includes(kind)) return 0;
  const slot = part === "head" ? "head" : "body";
  const a = wornIn(game, p, slot);
  if (a === undefined) return 0;
  const r = game.reg.items.list[a].armor![kind as ArmorKind];
  // Body armor is a vest: it covers the legs only half.
  return part === "l_leg" || part === "r_leg" ? r / 2 : r;
}

/** Walking speed factor from worn armor (heavy plate slows a little). */
export function armorMove(game: Game, p: Pawn): number {
  let m = 1;
  for (const a of p.armor) m *= game.reg.items.list[a].armor?.move ?? 1;
  return m;
}

/** How good a weapon is: damage per second, with range and accuracy counted for guns. */
export function weaponScore(d: ItemDef): number {
  const w = d.weapon;
  if (!w) return 0;
  const dps = (w.dmg / w.cooldown) * 60;
  return w.range > 1.5 ? dps * (1.3 + w.range / 30) * (1 + w.accuracy) : dps;
}

/** How good an armor piece is: its mean protection, a little less for slow ones. */
export function armorScore(d: ItemDef): number {
  const a = d.armor;
  if (!a) return 0;
  return (ARMOR_KINDS.reduce((s, k) => s + a[k], 0) / ARMOR_KINDS.length) * (0.5 + a.move / 2);
}
