import { describe, expect, it } from "vitest";
import { loadCoreContent } from "@wc/data";
import { bankSize, canPlace, designate, Game, placeBlueprint, isPowered, makeRobot, NO_THING, setSwitch, WORK_TYPES } from "../src/index.ts";

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

describe("wires and pipes in walls (user request)", () => {
  it("a wire runs through a wall, a pipe cannot join it there, and the wire stays when the wall goes", () => {
    const { g, x0, y0 } = setup("wallwire");
    g.research.done.add("scrap_power").add("plumbing");
    const gen = g.spawnThing("scrap_generator", 0, x0, y0);
    gen.fuel = 30;
    const ex = Math.max(...g.footprint(gen.def, gen.x, gen.y).map((f) => f.x));
    g.spawnThing("wire", 0, ex + 1, y0);
    const wall = g.spawnThing("scrap_wall", 0, ex + 2, y0);
    g.spawnThing("wire", 0, ex + 3, y0);
    const lamp = g.spawnThing("lamp", 0, ex + 4, y0);
    lamp.bank = 0;
    run(g, 0.2);
    expect(isPowered(g, lamp)).toBe(false);
    // A builder lays the wire into the wall.
    expect(placeBlueprint(g, "thing", "wire", 0, ex + 2, y0)).not.toBeNull();
    const [p] = [...g.pawns.values()].filter((o) => o.faction === "colony");
    p.work = Object.fromEntries(WORK_TYPES.map((w) => [w, w === "construct" || w === "haul" ? 1 : 0]));
    run(g, 4);
    expect(wall.line).toBe("wire");
    expect(g.things.get(wall.id)).toBe(wall);
    expect(isPowered(g, lamp)).toBe(true);
    // One line per tile: no pipe into the same wall.
    expect(canPlace(g, "thing", "pipe", 0, ex + 2, y0)).toBe(false);
    // The wall goes, the wire stays.
    g.removeThing(wall.id);
    run(g, 0.2);
    expect(g.thingDefAt(0, ex + 2, y0)?.id).toBe("wire");
    expect(isPowered(g, lamp)).toBe(true);
  });

  it("the Remove wire/pipe order takes the line out and leaves the wall", () => {
    const { g, x0, y0 } = setup("unline");
    const gen = g.spawnThing("scrap_generator", 0, x0, y0);
    gen.fuel = 30;
    const ex = Math.max(...g.footprint(gen.def, gen.x, gen.y).map((f) => f.x));
    g.spawnThing("wire", 0, ex + 1, y0);
    const wall = g.spawnThing("scrap_wall", 0, ex + 2, y0);
    wall.line = "wire";
    g.spawnThing("wire", 0, ex + 3, y0);
    const lamp = g.spawnThing("lamp", 0, ex + 4, y0);
    g.powerVersion++;
    run(g, 0.2);
    expect(isPowered(g, lamp)).toBe(true);
    expect(designate(g, "unline", 0, ex + 2, y0)).toBe(true);
    for (const p of g.pawns.values()) if (p.faction === "colony") p.work = Object.fromEntries(WORK_TYPES.map((w) => [w, w === "construct" ? 1 : 0]));
    lamp.bank = 0;
    run(g, 3);
    expect(wall.line).toBeUndefined();
    expect(g.things.get(wall.id)).toBe(wall);
    expect(isPowered(g, lamp)).toBe(false);
    expect(designate(g, "unline", 0, ex + 2, y0)).toBe(false);
  });

  it("a wall built over a pipe takes the pipe inside", () => {
    const { g, x0, y0 } = setup("wallpipe");
    g.spawnThing("pipe", 0, x0 + 3, y0 + 3);
    expect(placeBlueprint(g, "thing", "scrap_wall", 0, x0 + 3, y0 + 3)).not.toBeNull();
    for (const p of g.pawns.values()) if (p.faction === "colony") p.work = Object.fromEntries(WORK_TYPES.map((w) => [w, w === "construct" || w === "haul" ? 1 : 0]));
    run(g, 4);
    expect(g.thingDefAt(0, x0 + 3, y0 + 3)?.id).toBe("scrap_wall");
    const L = g.map.layers[0];
    expect(g.things.get(L.thing[L.i(x0 + 3, y0 + 3)])!.line).toBe("pipe");
  });
});

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
    // The lamp's own backup battery is empty, so it goes dark at once.
    lamp.bank = 0;
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
    const lamp2 = g.spawnThing("lamp", 0, x0 + 8, y0);
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

describe("backup batteries", () => {
  it("a machine keeps running on its own backup battery for a while after the power goes", () => {
    const { g, x0, y0 } = setup("backup");
    const gen = g.spawnThing("scrap_generator", 0, x0, y0);
    gen.fuel = 30;
    const lamp = g.spawnThing("lamp", 0, x0 + 2, y0);
    run(g, 5);
    expect(lamp.bank).toBeCloseTo(bankSize(g, lamp), 1);
    gen.fuel = 0;
    run(g, 0.2);
    expect(isPowered(g, lamp)).toBe(true);
    expect(lamp.bank!).toBeLessThan(bankSize(g, lamp));
    run(g, 1);
    expect(isPowered(g, lamp)).toBe(false);
  });

  it("the robot bay stores twice a battery, fills from the network and charges robots from it", () => {
    const { g, x0, y0 } = setup("bay");
    g.research.done.add("robotics");
    const gen = g.spawnThing("scrap_generator", 0, x0, y0);
    gen.fuel = 60;
    const bay = g.spawnThing("robot_bay", 0, x0 + 2, y0);
    const battery = content.things.find((t) => t.id === "battery")!;
    expect(bankSize(g, bay)).toBe(2 * battery.power!.store);
    run(g, 2);
    const filled = bay.bank ?? 0;
    expect(filled).toBeGreaterThan(0);
    // Unplug the bay: a low robot still charges from what the bay holds.
    g.removeThing(gen.id);
    const bot = makeRobot(g, "robot", 0, x0 + 2, y0 + 3);
    bot.charge = 0.1;
    g.pawns.set(bot.id, bot);
    run(g, 2);
    expect(bot.charge).toBeGreaterThan(0.2);
    expect(bay.bank!).toBeLessThan(filled);
  });
});
