/** Starting colony: survivors and supplies at the map center. */
import { makeFamily } from "./social.ts";
import type { Game } from "./game.ts";
import { dropItems } from "./items.ts";
import { addMemory, makeSurvivor } from "./pawn.ts";

export const START_SUPPLIES: Record<string, number> = {
  canned_food: 36,
  clean_water: 30,
  scrap: 70,
  wood: 40,
  cloth: 10,
};

export function setupStart(game: Game, survivors = 3): void {
  const cx = game.map.w >> 1, cy = game.map.h >> 1;
  game.home = { layer: 0, x: cx, y: cy };
  const used = new Set<string>();
  const spots = [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [0, -1]];
  // Start gear: one gun, one blade, one pipe.
  const gear = ["pipe_pistol", "machete", "pipe"];
  for (let i = 0; i < survivors; i++) {
    const [dx, dy] = spots[i % spots.length];
    const p = makeSurvivor(game, 0, cx + dx, cy + dy, used);
    p.weapon = game.reg.items.idx(gear[i % gear.length]);
    p.clothes = game.reg.items.idx("patched_clothes");
    addMemory(game, p, "survived_the_end");
    game.pawns.set(p.id, p);
  }
  makeFamily(game, [...game.pawns.values()].filter((p) => p.faction === "colony"));
  let ox = 3;
  for (const [item, n] of Object.entries(START_SUPPLIES)) {
    dropItems(game, item, n, 0, cx + ox, cy + 3);
    ox++;
  }
}
