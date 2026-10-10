/**
 * Start scenarios (spec 07, Beta B5). Applied once after the home map and the start colony exist.
 * standard: three survivors. lone: one survivor with a little more gear. mall: the colony starts in
 * a ruined supermarket full of loot, and the rats come at once. bunker: the colony starts in the cave
 * under the stairs while a long radiation cloud covers the surface. rad_season: clouds come every
 * few days all year.
 */
import type { Game } from "./game.ts";
import { dropItems } from "./items.ts";
import { NO_THING } from "./map.ts";
import { spawnPack } from "./storyteller.ts";

export const SCENARIOS = ["standard", "lone", "mall", "bunker", "rad_season"] as const;

/** Survivors at the start for a scenario. */
export function startSurvivors(scenario: string): number {
  return scenario === "lone" ? 1 : 3;
}

export function applyScenario(game: Game): void {
  const s = game.opts.scenario;
  const { x: hx, y: hy } = game.home;
  if (s === "lone") {
    dropItems(game, "bandage", 6, 0, hx + 2, hy + 2);
    dropItems(game, "scrap", 40, 0, hx + 3, hy + 2);
  } else if (s === "mall") {
    // A 16 x 12 ruined store around home, with three broken entrances.
    const L = game.map.layers[0];
    const x0 = hx - 8, y0 = hy - 6, w = 16, h = 12;
    for (let y = y0; y < y0 + h; y++)
      for (let x = x0; x < x0 + w; x++) {
        if (!L.inBounds(x, y)) continue;
        const th = L.thing[L.i(x, y)];
        // Keep stairs: the caves below have stairs up to them.
        if (th !== NO_THING && game.reg.things.list[game.things.get(th)!.def].kind !== "stairs") game.removeThing(th);
        game.setTerrain(0, x, y, "ruin_floor");
        const edge = x === x0 || y === y0 || x === x0 + w - 1 || y === y0 + h - 1;
        const gap = (y === y0 + h - 1 && (x === hx || x === hx + 1)) || (x === x0 && y === hy) || (x === x0 + w - 1 && y === hy - 2);
        if (edge && !gap) game.spawnThing("ruin_wall", 0, x, y);
      }
    // Shelves of loot: crates in rows.
    for (let k = 0; k < 8; k++) {
      const x = x0 + 2 + (k % 4) * 3, y = y0 + 2 + Math.floor(k / 4) * 6;
      if (L.thing[L.i(x, y)] === NO_THING) game.spawnThing("loot_crate", 0, x, y);
    }
    dropItems(game, "canned_food", 40, 0, hx - 4, hy + 3);
    spawnPack(game, "rad_rats", 6);
  } else if (s === "bunker") {
    // Everyone starts by the stairs in the cave; the surface glows for two days.
    const up = [...game.things.values()].find((t) => game.reg.things.list[t.def].id === "stairs_up" && game.map.layers[t.layer].underground);
    if (up) {
      const cave = game.map.layers[up.layer];
      for (const p of game.pawns.values()) {
        if (p.faction !== "colony") continue;
        p.layer = up.layer;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
          if (game.walkable(up.layer, up.x + dx, up.y + dy) && ![...game.pawns.values()].some((o) => o !== p && o.layer === up.layer && o.x === up.x + dx && o.y === up.y + dy)) {
            p.x = up.x + dx;
            p.y = up.y + dy;
            break;
          }
        }
      }
      // The start supplies move down too.
      for (const st of [...game.items.values()]) {
        if (st.layer !== 0 || Math.abs(st.x - hx) > 8 || Math.abs(st.y - hy) > 8) continue;
        game.items.delete(st.id);
        game.map.layers[0].item[game.map.layers[0].i(st.x, st.y)] = NO_THING;
        dropItems(game, st.def, st.count, up.layer, up.x, up.y);
      }
      void cave;
    }
    game.weather.kind = "rad_cloud";
    game.weather.until = game.tick + game.ticksPerDay * 2;
    game.weather.lastRadCloud = game.tick;
  }
  if (s !== "standard") game.message(`msg.scenario.${s}`, {}, "info");
}
