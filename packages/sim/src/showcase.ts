/**
 * Showcase colony: a developed base built at once, for the presentation clips and for players
 * who want to see later features right away (URL ?showcase=1). Everything is placed directly.
 */
import type { Game } from "./game.ts";
import { createZone } from "./hauling.ts";
import { dropItems } from "./items.ts";
import { NO_THING } from "./map.ts";
import { makeSurvivor } from "./pawn.ts";
import { completeRoofs } from "./rooms.ts";

export function buildShowcase(game: Game): void {
  const { x: hx, y: hy } = game.home;
  const L = game.map.layers[0];
  // Clear a flat yard around home.
  for (let y = hy - 16; y <= hy + 16; y++)
    for (let x = hx - 18; x <= hx + 18; x++) {
      if (!L.inBounds(x, y)) continue;
      const i = L.i(x, y);
      if (L.thing[i] !== NO_THING) game.removeThing(L.thing[i]);
      if (L.item[i] !== NO_THING) {
        game.items.delete(L.item[i]);
        L.item[i] = NO_THING;
      }
      game.setTerrain(0, x, y, "dirt");
    }
  for (const r of ["scrap_power", "batteries", "electric_lights", "powered_tools", "smelting", "turret_wiring", "conveyors", "auto_crafting", "rain_catchers", "field_medicine", "gunsmithing"])
    game.research.done.add(r);

  const put = (id: string, x: number, y: number, rot?: number) => {
    if (L.inBounds(x, y) && L.thing[L.i(x, y)] === NO_THING) return game.spawnThing(id, 0, x, y, rot);
    return null;
  };

  // House: 11 x 8 stone room, wood floor, door to the south.
  const rx = hx - 6, ry = hy - 9, rw = 11, rh = 8;
  for (let y = ry; y < ry + rh; y++)
    for (let x = rx; x < rx + rw; x++) {
      const edge = x === rx || y === ry || x === rx + rw - 1 || y === ry + rh - 1;
      if (edge) put(x === rx + 5 && y === ry + rh - 1 ? "scrap_door" : "stone_wall", x, y);
      else L.floor[L.i(x, y)] = game.reg.floors.idx("wood_floor") + 1;
    }
  // Airlock: a second door set between two walls outside the first one.
  put("stone_wall", rx + 4, ry + rh);
  put("scrap_door", rx + 5, ry + rh);
  put("stone_wall", rx + 6, ry + rh);
  for (let i = 0; i < 4; i++) put("scrap_bed", rx + 1 + i * 2, ry + 1);
  put("table", rx + 4, ry + 4);
  put("chair", rx + 3, ry + 4);
  put("chair", rx + 5, ry + 4);
  put("campfire", rx + 8, ry + 5);
  put("well", rx + 9, ry + 1);
  put("research_desk", rx + 1, ry + 5);

  // Power: generator, battery, wires to a lamp by the door and to the turret.
  const gen = put("scrap_generator", rx - 3, ry + 7);
  if (gen) gen.fuel = 30;
  const bat = put("battery", rx - 3, ry + 8);
  if (bat) bat.charge = 1600;
  for (let x = rx - 2; x <= rx + 3; x++) put("wire", x, ry + 9);
  put("lamp", rx + 4, ry + 9);
  for (let x = rx + 5; x <= rx + 12; x++) put("wire", x, ry + 10);
  put("scrap_turret", rx + 13, ry + 10);
  for (let y = ry + 8; y <= ry + 12; y++) put("sandbags", rx + 15, y);

  // Workshop row: benches, stove, smelter.
  put("scrap_bench", rx + 13, ry + 1);
  put("stove", rx + 13, ry + 3);
  put("powered_bench", rx + 13, ry + 5);
  put("wire", rx + 12, ry + 5);
  put("wire", rx + 12, ry + 6);
  put("wire", rx + 12, ry + 7);
  put("wire", rx + 12, ry + 8);
  put("wire", rx + 12, ry + 9);

  // Factory line: scrap behind a loader, belt east into an auto-crafter making components.
  const fy = hy + 6, fx = hx - 12;
  // The scrap sits in its own stockpile tile, so haulers leave it for the loader.
  createZone(game, "stockpile", 0, [{ x: fx - 1, y: fy }, { x: fx - 2, y: fy }]);
  dropItems(game, "scrap", 75, 0, fx - 1, fy);
  dropItems(game, "scrap", 75, 0, fx - 2, fy);
  put("loader", fx, fy, 0);
  for (let i = 1; i <= 6; i++) put("conveyor", fx + i, fy, 0);
  const crafter = put("auto_crafter", fx + 7, fy, 0);
  if (crafter) crafter.recipe = "make_components";
  for (let i = 8; i <= 10; i++) put("conveyor", fx + i, fy, 0);
  put("wire", fx, fy + 1);
  for (let i = 1; i <= 7; i++) put("wire", fx + i, fy + 1);
  const gen2 = put("scrap_generator", fx + 8, fy + 1);
  if (gen2) gen2.fuel = 30;

  // Farm: glowcorn and fiber weed at different growth.
  const farm: { x: number; y: number }[] = [];
  for (let y = hy + 1; y <= hy + 4; y++) for (let x = hx + 4; x <= hx + 13; x++) farm.push({ x, y });
  for (const t of farm) game.setTerrain(0, t.x, t.y, "rich_soil");
  createZone(game, "grow", 0, farm, undefined, "glowcorn_plant");
  for (const t of farm) {
    const p = put(t.x < hx + 9 ? "glowcorn_plant" : "fiber_weed_plant", t.x, t.y);
    if (p) p.growth = 0.35 + game.aiRng.next() * 0.65;
  }

  // Stockpile with a bit of everything.
  const sp: { x: number; y: number }[] = [];
  for (let y = hy + 8; y <= hy + 11; y++) for (let x = hx + 4; x <= hx + 9; x++) sp.push({ x, y });
  createZone(game, "stockpile", 0, sp);
  const stock: [string, number][] = [["wood", 60], ["stone", 40], ["scrap", 60], ["steel", 25], ["components", 8], ["simple_meal", 10], ["clean_water", 20], ["bandage", 8], ["cloth", 20], ["canned_food", 15]];
  stock.forEach(([item, n], k) => dropItems(game, item, n, 0, hx + 4 + (k % 6), hy + 8 + Math.floor(k / 6)));
  put("rain_collector", hx + 11, hy + 9);

  // Two more survivors, so the base looks lived in.
  const used = new Set([...game.pawns.values()].flatMap((p) => [p.first, p.nick]));
  for (let i = 0; i < 2; i++) {
    const p = makeSurvivor(game, 0, hx + i, hy - 1, used);
    p.weapon = game.reg.items.idx(i ? "crossbow" : "pipe_pistol");
    game.pawns.set(p.id, p);
  }
  completeRoofs(game);
  game.goals = { shelter: true, water: true, lights: true };
  game.message("msg.showcase", {}, "info");
}
