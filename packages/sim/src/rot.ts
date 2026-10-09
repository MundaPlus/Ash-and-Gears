/** Food rot (spec 04): full rate when warm, half rate when cool, none below freezing. */
import type { Game } from "./game.ts";
import { takeFromStack } from "./items.ts";
import { tempAt } from "./rooms.ts";

export function rotRate(temp: number): number {
  if (temp <= 0) return 0;
  if (temp < 10) return 0.5;
  return 1;
}

export function tickRot(game: Game): void {
  const tph = Math.round(game.ticksPerHour);
  if (game.tick % tph !== 0) return;
  const rotted: number[] = [];
  for (const s of game.items.values()) {
    const days = game.reg.items.list[s.def].rotDays;
    if (!days || s.layer < 0) continue;
    s.rot = (s.rot ?? 0) + rotRate(tempAt(game, s.layer, s.x, s.y)) / (days * 24);
    if (s.rot >= 1) rotted.push(s.id);
  }
  for (const id of rotted) {
    const s = game.items.get(id)!;
    game.message("msg.food_rotted", { count: s.count, item: game.reg.items.list[s.def].id }, "warn");
    takeFromStack(game, id, s.count);
  }
}
