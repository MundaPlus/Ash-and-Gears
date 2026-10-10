import { describe, expect, it } from "vitest";
import { loadCoreContent } from "@wc/data";
import { dropItems, fluidNetOf, Game, loadGame, netAmount, NO_THING, saveGame, WORK_TYPES } from "../src/index.ts";

const content = loadCoreContent();
const run = (g: Game, hours: number) => {
  for (let i = 0, n = Math.round(hours * g.ticksPerHour); i < n; i++) g.step();
};

/**
 * Sludge at x0-1, pump at x0, pipes east to a tank, the purifier (2x1, turned so its input side is
 * west and its output side east) and a tap behind it. Power from a generator north of the pump.
 */
function waterworks(seed: string) {
  const g = Game.create(content, { seed, mapSize: 96, storyteller: "none" });
  const x0 = g.home.x - 16, y0 = g.home.y - 10;
  const L = g.map.layers[0];
  for (let y = y0 - 3; y <= y0 + 3; y++)
    for (let x = x0 - 2; x <= x0 + 12; x++) {
      const t = L.thing[L.i(x, y)];
      if (t !== NO_THING) g.removeThing(t);
      g.setTerrain(0, x, y, "dirt");
    }
  for (const p of g.pawns.values()) p.work = Object.fromEntries(WORK_TYPES.map((w) => [w, 0]));
  g.setTerrain(0, x0 - 1, y0, "sludge");
  const gen = g.spawnThing("scrap_generator", 0, x0, y0 - 1);
  gen.fuel = 30;
  const pump = g.spawnThing("water_pump", 0, x0, y0);
  g.spawnThing("pipe", 0, x0 + 1, y0);
  const tank = g.spawnThing("water_tank", 0, x0 + 2, y0);
  g.spawnThing("pipe", 0, x0 + 3, y0);
  // Turned to 1x2 upright at x0+4; rot 3 puts the input side west and the output side east.
  const purifier = g.spawnThing("water_purifier", 0, x0 + 4, y0, 3);
  g.spawnThing("wire", 0, x0 + 4, y0 - 1);
  g.spawnThing("wire", 0, x0 + 3, y0 - 1);
  g.spawnThing("wire", 0, x0 + 2, y0 - 1);
  const tapPipe = g.spawnThing("pipe", 0, x0 + 5, y0);
  const tap = g.spawnThing("water_tap", 0, x0 + 6, y0);
  return { g, x0, y0, gen, pump, tank, purifier, tapPipe, tap };
}

describe("pipes and fluids (A2)", () => {
  it("a pump fills pipes and a tank from sludge, and a purifier makes clean water for the tap", () => {
    const { g, tank, tap } = waterworks("pump");
    run(g, 4);
    const raw = fluidNetOf(g, tank)!;
    const clean = fluidNetOf(g, tap)!;
    expect(raw).not.toBe(clean);
    expect(netAmount(g, raw, "water")).toBeGreaterThan(50);
    expect(netAmount(g, clean, "clean_water")).toBeGreaterThan(5);
    expect(netAmount(g, raw, "clean_water")).toBe(0);
  });

  it("a thirsty survivor drinks at the tap", () => {
    const { g, gen, tap } = waterworks("tap");
    run(g, 3);
    // Power off: the purifier stops, so only drinking changes the clean water now.
    gen.fuel = 0;
    run(g, 0.5);
    const clean = fluidNetOf(g, tap)!;
    const before = netAmount(g, clean, "clean_water");
    // Take every other water source away.
    for (const s of [...g.items.values()]) if (g.reg.items.list[s.def].category === "water") g.items.delete(s.id);
    const L = g.map.layers[0];
    for (let i = 0; i < L.item.length; i++) if (L.item[i] !== NO_THING && !g.items.has(L.item[i])) L.item[i] = NO_THING;
    const [p] = [...g.pawns.values()].filter((c) => c.faction === "colony");
    p.needs.thirst = 0.3;
    run(g, 2);
    expect(p.needs.thirst).toBeGreaterThan(0.6);
    expect(netAmount(g, clean, "clean_water")).toBeLessThan(before - 2);
  });

  it("fluids in pipes survive a save", () => {
    const { g, tank } = waterworks("save");
    run(g, 2);
    const amount = netAmount(g, fluidNetOf(g, tank)!, "water");
    const g2 = loadGame(content, JSON.parse(JSON.stringify(saveGame(g))));
    const t2 = g2.things.get(tank.id)!;
    expect(netAmount(g2, fluidNetOf(g2, t2)!, "water")).toBeCloseTo(amount);
  });

  it("a fuel still makes fuel from raw food, and a generator on its pipes fills up", () => {
    const { g, x0, y0 } = waterworks("still");
    g.research.done.add("biofuel");
    // Still (2x1) at y0+2, a pipe, and a second generator touching the pipe.
    const still = g.spawnThing("fuel_still", 0, x0 + 1, y0 + 2);
    g.spawnThing("pipe", 0, x0 + 3, y0 + 2);
    const gen2 = g.spawnThing("scrap_generator", 0, x0 + 4, y0 + 2);
    gen2.fuel = 0;
    dropItems(g, "glowcorn", 40, 0, x0 + 1, y0 + 3);
    const [cook] = [...g.pawns.values()].filter((p) => p.faction === "colony");
    cook.work = Object.fromEntries(WORK_TYPES.map((w) => [w, w === "craft" ? 1 : 0]));
    run(g, 12);
    expect(gen2.fuel).toBeGreaterThan(5);
    expect(fluidNetOf(g, still)).not.toBeNull();
  });
});
