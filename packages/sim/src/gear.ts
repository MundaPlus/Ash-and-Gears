/**
 * Weapon and armor tiers (N2). Armor sits in two slots: body (torso and arms, half on the legs) and
 * head. Each piece stops a share of each damage kind. Survivors swap to clearly better gear from storage.
 */
import type { ItemDef } from "@wc/data";
import type { Game } from "./game.ts";
import type { PartId } from "./health.ts";
import type { GearSlot, Pawn } from "./pawn.ts";
import { dropItems } from "./items.ts";
import { COMFORT_MAX, COMFORT_MIN, DAILY_SWING, roomAt, SEASON_BASE } from "./rooms.ts";

export const ARMOR_KINDS = ["cut", "blunt", "gunshot", "arrow", "bite", "burn"] as const;
type ArmorKind = (typeof ARMOR_KINDS)[number];

/** A piece of gear must be this much better (score ratio) before a survivor swaps. */
export const UPGRADE_MARGIN = 1.15;

/** The armor item a pawn wears in a slot, or undefined. */
export function wornIn(game: Game, p: Pawn, slot: "body" | "head"): number | undefined {
  return p.armor.find((a) => game.reg.items.list[a].armor?.slot === slot);
}

/** Last tick each survivor looked for better gear (per game). */
export const gearChecked = new WeakMap<Game, Map<number, number>>();

/** True when the player keeps this slot empty (auto-equip skips it). */
export function gearHeld(p: Pawn, slot: GearSlot): boolean {
  return !!p.gearHold?.includes(slot);
}

/** Take off the gear in a slot and drop it where the survivor stands. The slot then stays empty. */
export function dropGear(game: Game, p: Pawn, slot: GearSlot): void {
  const item = slot === "weapon" ? p.weapon : slot === "clothes" ? p.clothes : wornIn(game, p, slot);
  if (item === null || item === undefined) return;
  if (slot === "weapon") p.weapon = null;
  else if (slot === "clothes") delete p.clothes;
  else p.armor = p.armor.filter((a) => a !== item);
  dropItems(game, item, 1, p.layer, p.x, p.y);
  holdGear(game, p, slot, true);
}

/** Keep a slot empty (true), or let the survivor pick gear for it again (false: they look at once). */
export function holdGear(game: Game, p: Pawn, slot: GearSlot, on: boolean): void {
  const rest = (p.gearHold ?? []).filter((s) => s !== slot);
  if (on) rest.push(slot);
  else gearChecked.get(game)?.delete(p.id);
  if (rest.length) p.gearHold = rest;
  else delete p.gearHold;
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

/** Warmth of a clothes item (cold: degrees added below, heat: degrees taken off above); none for no clothes. */
function clothesStats(game: Game, item: number | undefined, indoors: boolean): { cold: number; heat: number } {
  const c = item === undefined ? undefined : game.reg.items.list[item].clothes;
  if (!c) return { cold: 0, heat: 0 };
  // Inside a room a survivor opens a heavy coat: it warms like light clothes and is not too hot.
  return indoors ? { cold: Math.min(c.cold, 5), heat: Math.min(c.heat, 1) } : c;
}

/** The temperatures a survivor is comfortable at where they stand now, with their clothes. */
export function comfortRange(game: Game, p: Pawn): { min: number; max: number } {
  const r = roomAt(game, p.layer, p.x, p.y);
  const c = clothesStats(game, p.clothes, !!r && !r.outdoor);
  return { min: COMFORT_MIN - c.cold, max: COMFORT_MAX - c.heat };
}

/** How uncomfortable these clothes are outdoors today: degrees outside the comfort range at dawn and at noon. */
export function clothesDiscomfort(game: Game, item: number | undefined): number {
  const c = clothesStats(game, item, false);
  const season = Math.floor(game.tick / game.ticksPerDay / game.opts.seasonDays) % 4;
  const base = SEASON_BASE[season] + game.weatherTempOffset;
  let sum = 0;
  for (const t of [base - DAILY_SWING, base + DAILY_SWING]) sum += Math.max(0, COMFORT_MIN - c.cold - t) + Math.max(0, t - (COMFORT_MAX - c.heat));
  return sum;
}

/** Change clothes only when it helps by this many degrees (no swapping back and forth). */
export const CLOTHES_MARGIN = 1.5;
