/**
 * Food rot (spec 04): full rate when warm, half rate when cool, none below freezing. Food under a roof
 * (or underground) rots slower than food in the open: no rain, sun or pests on it (user request).
 */
import type { Game } from "./game.ts";
import { takeFromStack } from "./items.ts";
import type { ItemStack } from "./map.ts";
import { isRoofed, tempAt } from "./rooms.ts";

/** Rot speed under a roof, against the open. */
export const ROOFED_ROT = 0.6;

/** Rot speed of a stack where it lies now: temperature, and a roof over it. */
export function rotRateAt(game: Game, s: ItemStack): number {
  const r = rotRate(tempAt(game, s.layer, s.x, s.y));
  return isRoofed(game, s.layer, s.x, s.y) ? r * ROOFED_ROT : r;
}

export function rotRate(temp: number): number {
  if (temp <= 0) return 0;
  if (temp < 10) return 0.5;
  return 1;
}

/** Days until a stack rots at the temperature where it lies now (Infinity when frozen or it never rots). */
export function daysToRot(game: Game, s: ItemStack): number {
  const days = game.reg.items.list[s.def].rotDays;
  const rate = rotRateAt(game, s);
  if (!days || rate <= 0) return Infinity;
  return ((1 - (s.rot ?? 0)) * days) / rate;
}

export function tickRot(game: Game): void {
  const tph = Math.round(game.ticksPerHour);
  if (game.tick % tph !== 0) return;
  const rotted: number[] = [];
  for (const s of game.items.values()) {
    const days = game.reg.items.list[s.def].rotDays;
    if (!days || s.layer < 0) continue;
    const before = s.rot ?? 0;
    s.rot = before + rotRateAt(game, s) / (days * 24);
    // Half rotten: redraw, so the stack shows its spoiling mark.
    if (before < 0.5 && s.rot >= 0.5) game.map.layers[s.layer].touch(s.x, s.y);
    if (s.rot >= 1) rotted.push(s.id);
  }
  for (const id of rotted) {
    const s = game.items.get(id)!;
    game.message("msg.food_rotted", { count: s.count, item: game.reg.items.list[s.def].id }, "warn");
    takeFromStack(game, id, s.count);
  }
}
