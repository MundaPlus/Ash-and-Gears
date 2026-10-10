import { describe, expect, it } from "vitest";
import { loadCoreContent } from "@wc/data";
import { createZone, dropItems, Game, haulList, isLitAt, lightWorkFactor, NO_THING, WORK_TYPES } from "../src/index.ts";

const content = loadCoreContent();
const run = (g: Game, hours: number) => {
  for (let i = 0, n = Math.round(hours * g.ticksPerHour); i < n; i++) g.step();
};

function setup(seed: string) {
  const g = Game.create(content, { seed, mapSize: 96, storyteller: "none" });
  const x0 = g.home.x + 4, y0 = g.home.y - 12;
  const L = g.map.layers[0];
  for (let y = y0 - 1; y <= y0 + 4; y++)
    for (let x = x0 - 1; x <= x0 + 12; x++) {
      const t = L.thing[L.i(x, y)];
      if (t !== NO_THING) g.removeThing(t);
      g.setTerrain(0, x, y, "dirt");
    }
  const pawns = [...g.pawns.values()].filter((p) => p.faction === "colony");
  for (const p of pawns) p.work = Object.fromEntries(WORK_TYPES.map((w) => [w, 0]));
  return { g, x0, y0, pawns };
}

describe("graves and corpses (B9)", () => {
  it("a corpse goes to a grave, never to a stockpile or chest, and upsets survivors nearby", () => {
    const { g, x0, y0, pawns } = setup("grave");
    createZone(g, "stockpile", 0, [{ x: x0, y: y0 }]);
    g.spawnThing("scrap_chest", 0, x0 + 1, y0);
    dropItems(g, "corpse", 1, 0, x0 + 6, y0 + 2);
    const L = g.map.layers[0];
    const corpse = L.item[L.i(x0 + 6, y0 + 2)];
    expect(haulList(g).some((e) => e.id === corpse)).toBe(false);
    const [p] = pawns;
    p.x = x0 + 7;
    p.y = y0 + 2;
    run(g, 0.2);
    expect(p.situational.map((i) => g.reg.thoughts.list[i].id)).toContain("corpse_nearby");
    const grave = g.spawnThing("grave", 0, x0 + 10, y0 + 3);
    p.work = Object.fromEntries(WORK_TYPES.map((w) => [w, w === "haul" ? 1 : 0]));
    run(g, 2);
    expect(grave.filled).toBe(true);
    expect([...g.items.values()].some((s) => g.reg.items.list[s.def].id === "corpse")).toBe(false);
  });
});

describe("wood grows back (B9)", () => {
  it("wild shrubs sprout each day away from home", () => {
    const { g } = setup("sprout");
    const shrubs = () => [...g.things.values()].filter((t) => g.reg.things.list[t.def].id === "mutant_shrub").length;
    const before = shrubs();
    run(g, 48);
    expect(shrubs()).toBeGreaterThan(before);
  });

  it("an ash willow grows in a grow zone and gives wood", () => {
    const { g, x0, y0, pawns } = setup("willow");
    createZone(g, "grow", 0, [{ x: x0 + 3, y: y0 + 1 }], undefined, "ash_willow_plant");
    const [p] = pawns;
    p.work = Object.fromEntries(WORK_TYPES.map((w) => [w, w === "grow" ? 1 : 0]));
    run(g, 2);
    const L = g.map.layers[0];
    const tree = g.things.get(L.thing[L.i(x0 + 3, y0 + 1)]);
    expect(tree && g.reg.things.list[tree.def].id).toBe("ash_willow_plant");
    tree!.growth = 1;
    run(g, 3);
    const wood = [...g.items.values()].filter((s) => g.reg.items.list[s.def].id === "wood" && Math.abs(s.x - (x0 + 3)) <= 2 && Math.abs(s.y - (y0 + 1)) <= 2).reduce((n, s) => n + s.count, 0);
    expect(wood).toBeGreaterThan(5);
  });
});

describe("light (B9)", () => {
  it("the surface is lit by day; at night only a powered lamp lights its area, and work in the dark is slower", () => {
    const { g, x0, y0, pawns } = setup("light");
    const [p] = pawns;
    p.x = x0 + 8;
    p.y = y0 + 2;
    expect(isLitAt(g, 0, p.x, p.y)).toBe(true);
    while (g.hourOfDay < 22) g.step();
    expect(isLitAt(g, 0, p.x, p.y)).toBe(false);
    expect(lightWorkFactor(g, p)).toBeLessThan(1);
    const gen = g.spawnThing("scrap_generator", 0, x0, y0);
    gen.fuel = 30;
    g.spawnThing("lamp", 0, x0 + 2, y0);
    run(g, 0.1);
    expect(isLitAt(g, 0, x0 + 8, y0 + 2)).toBe(true);
    p.x = x0 + 8;
    p.y = y0 + 2;
    expect(lightWorkFactor(g, p)).toBe(1);
  });
});
