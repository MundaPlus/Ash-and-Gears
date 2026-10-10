import { describe, expect, it } from "vitest";
import { loadCoreContent } from "@wc/data";
import { Game, isPowered, NO_THING, setSwitch, WORK_TYPES } from "../src/index.ts";

const content = loadCoreContent();
const run = (g: Game, hours: number) => {
  for (let i = 0, n = Math.round(hours * g.ticksPerHour); i < n; i++) g.step();
};

/** A game with a clear 16x9 area west of home and idle survivors; returns its top-left corner. */
function setup(seed: string) {
  const g = Game.create(content, { seed, mapSize: 96, storyteller: "none" });
  const x0 = g.home.x - 20, y0 = g.home.y - 12;
  const L = g.map.layers[0];
  for (let y = y0 - 1; y <= y0 + 8; y++)
    for (let x = x0 - 1; x <= x0 + 15; x++) {
      const t = L.thing[L.i(x, y)];
      if (t !== NO_THING) g.removeThing(t);
      g.setTerrain(0, x, y, "dirt");
    }
  for (const p of g.pawns.values()) p.work = Object.fromEntries(WORK_TYPES.map((w) => [w, 0]));
  return { g, x0, y0 };
}

describe("power grid (A3)", () => {
  it("power poles link groups up to 6 tiles apart, and a switch cuts the line", () => {
    const { g, x0, y0 } = setup("poles");
    const gen = g.spawnThing("scrap_generator", 0, x0, y0);
    gen.fuel = 30;
    g.spawnThing("power_pole", 0, x0 + 2, y0);
    g.spawnThing("power_pole", 0, x0 + 8, y0);
    const sw = g.spawnThing("power_switch", 0, x0 + 9, y0);
    const lamp = g.spawnThing("lamp", 0, x0 + 10, y0);
    run(g, 0.5);
    expect(isPowered(g, lamp)).toBe(true);
    setSwitch(g, sw, false);
    run(g, 0.5);
    expect(isPowered(g, lamp)).toBe(false);
    setSwitch(g, sw, true);
    run(g, 0.5);
    expect(isPowered(g, lamp)).toBe(true);
  });

  it("when power runs short, priority 3 machines go off first", () => {
    const { g, x0, y0 } = setup("priority");
    const gen = g.spawnThing("scrap_generator", 0, x0, y0);
    gen.fuel = 30;
    // 600 W for 350 + 200 + 30 + 60 W: the lamp (priority 3) and one more must go.
    const smelter = g.spawnThing("smelter", 0, x0 + 2, y0);
    const bench = g.spawnThing("powered_bench", 0, x0 + 4, y0);
    const lamp = g.spawnThing("lamp", 0, x0 + 6, y0);
    run(g, 0.5);
    expect(isPowered(g, smelter)).toBe(true);
    expect(isPowered(g, bench)).toBe(true);
    expect(isPowered(g, lamp)).toBe(true);
    const turret = g.spawnThing("scrap_turret", 0, x0 + 7, y0);
    run(g, 0.5);
    // 640 W wanted: the lamp goes off, the turret (priority 1) stays on.
    expect(isPowered(g, lamp)).toBe(false);
    expect(isPowered(g, turret)).toBe(true);
    expect(isPowered(g, smelter)).toBe(true);
    // The player marks the smelter "cut first": now it goes and the lamp comes back.
    smelter.priority = 3;
    lamp.priority = 1;
    run(g, 0.5);
    expect(isPowered(g, smelter)).toBe(false);
    expect(isPowered(g, lamp)).toBe(true);
  });

  it("solar panels work by day only; wind turbines always make some power", () => {
    const { g, x0, y0 } = setup("solar");
    const panel = g.spawnThing("solar_panel", 0, x0, y0);
    const lamp = g.spawnThing("lamp", 0, x0 + 2, y0);
    const turbine = g.spawnThing("wind_turbine", 0, x0 + 6, y0);
    const lamp2 = g.spawnThing("lamp", 0, x0 + 7, y0);
    g.weather.kind = "clear";
    // Run to noon, then to midnight.
    while (Math.abs(g.hourOfDay - 12) > 0.2) g.step();
    run(g, 0.2);
    expect(isPowered(g, lamp)).toBe(true);
    while (g.hourOfDay > 0.5) g.step();
    run(g, 0.2);
    expect(isPowered(g, lamp)).toBe(false);
    expect(isPowered(g, lamp2)).toBe(true);
    void panel;
    void turbine;
  });
});
