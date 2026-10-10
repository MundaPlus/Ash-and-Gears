/**
 * Showcase colony: a developed base built at once, for the presentation clips and for players
 * who want to see later features right away (URL ?showcase=1). Everything is placed directly.
 */
import type { Game } from "./game.ts";
import { createZone } from "./hauling.ts";
import { dropItems } from "./items.ts";
import { NO_THING } from "./map.ts";
import { makeSurvivor } from "./pawn.ts";
import { makeRobot } from "./robots.ts";
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
  for (const r of ["scrap_power", "batteries", "electric_lights", "powered_tools", "smelting", "turret_wiring", "conveyors", "auto_crafting", "rain_catchers", "field_medicine", "gunsmithing", "belt_logistics", "plumbing", "water_purification", "biofuel", "power_grid", "renewables", "deep_digging", "robotics"])
    game.research.done.add(r);

  const put = (id: string, x: number, y: number, rot?: number) => {
    if (game.fits(game.reg.things.idx(id), 0, x, y, rot)) return game.spawnThing(id, 0, x, y, rot);
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
  put("chair", rx + 6, ry + 4);
  const fire = put("campfire", rx + 8, ry + 5);
  if (fire) fire.fuel = 15;
  put("well", rx + 9, ry + 1);
  put("research_desk", rx + 1, ry + 5);

  // Power: generator, battery, wires to a lamp by the door and to the turret.
  const gen = put("scrap_generator", rx - 3, ry + 7);
  if (gen) gen.fuel = 30;
  const bat = put("battery", rx - 3, ry + 8);
  if (bat) bat.charge = 1600;
  for (let x = rx - 3; x <= rx + 3; x++) put("wire", x, ry + 9);
  put("lamp", rx + 4, ry + 9);
  // The turret line drops from the lamp, so lamp, bench and turret share the generator.
  for (let x = rx + 4; x <= rx + 12; x++) put("wire", x, ry + 10);
  put("scrap_turret", rx + 13, ry + 10);
  for (let y = ry + 8; y <= ry + 12; y++) put("sandbags", rx + 15, y);

  // Workshop row: benches, stove, smelter.
  put("scrap_bench", rx + 13, ry + 1);
  const stove = put("stove", rx + 13, ry + 3);
  if (stove) stove.fuel = 20;
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
  // Components go on: a splitter sends every other packet north, a robot arm lifts the rest into a chest.
  put("conveyor", fx + 8, fy, 0);
  put("belt_splitter", fx + 9, fy, 0);
  put("conveyor", fx + 10, fy, 0);
  put("robot_arm", fx + 11, fy, 0);
  put("scrap_chest", fx + 12, fy);
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

  // Waterworks (A2, A3): pump at a sludge pool, tank, purifier, tap; solar power with a battery and poles.
  for (let y = hy - 12; y <= hy - 10; y++) for (let x = hx - 17; x <= hx - 16; x++) game.setTerrain(0, x, y, "sludge");
  put("water_pump", hx - 15, hy - 11);
  put("pipe", hx - 14, hy - 11);
  const tank = put("water_tank", hx - 13, hy - 11);
  if (tank) tank.liquid = { water: 220 };
  put("pipe", hx - 12, hy - 11);
  put("water_purifier", hx - 11, hy - 11, 3);
  const pipe2 = put("pipe", hx - 10, hy - 11);
  if (pipe2) pipe2.liquid = { clean_water: 10 };
  const tap = put("water_tap", hx - 9, hy - 11);
  if (tap) tap.liquid = { clean_water: 5 };
  put("solar_panel", hx - 16, hy - 13);
  const bat2 = put("battery", hx - 17, hy - 13);
  if (bat2) bat2.charge = 2000;
  put("power_pole", hx - 14, hy - 13);
  put("power_pole", hx - 11, hy - 13);
  put("wire", hx - 11, hy - 12);

  // Robots (A7, B6): a powered robot bay with one robot of each kind.
  const bay = put("robot_bay", hx + 12, hy - 8);
  if (bay) bay.bank = 4800;
  put("solar_panel", hx + 14, hy - 8);
  put("wind_turbine", hx + 14, hy - 6);
  const bat3 = put("battery", hx + 16, hy - 8);
  if (bat3) bat3.charge = 2400;
  game.research.done.add("advanced_robotics");
  for (const [k, kind] of ["robot", "hauler_drone", "builder_bot", "miner_bot", "farmer_bot", "guard_bot"].entries()) {
    const bot = makeRobot(game, kind, 0, hx + 9 + k, hy - 5);
    game.pawns.set(bot.id, bot);
  }

  // Two more survivors, so the base looks lived in.
  const used = new Set([...game.pawns.values()].flatMap((p) => [p.first, p.nick]));
  for (let i = 0; i < 2; i++) {
    // A free tile near home (the airlock walls stand just south of the house).
    const sy = hy + 1;
    let sx = hx + i;
    for (let k = 0; k < 20 && !game.walkable(0, sx, sy); k++) sx++;
    const p = makeSurvivor(game, 0, sx, sy, used);
    p.weapon = game.reg.items.idx(i ? "crossbow" : "pipe_pistol");
    game.pawns.set(p.id, p);
  }
  completeRoofs(game);
  game.goals = { shelter: true, water: true, lights: true };
  game.message("msg.showcase", {}, "info");
}
