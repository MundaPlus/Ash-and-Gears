import { describe, expect, it } from "vitest";
import { loadCoreContent } from "@wc/data";
import { countItems, designate, dropItems, Game, NO_THING, placeBlueprint, WORK_TYPES } from "../src/index.ts";

const content = loadCoreContent();
const run = (g: Game, hours: number) => {
  for (let i = 0, n = Math.round(hours * g.ticksPerHour); i < n; i++) g.step();
};
const things = (g: Game, id: string) => [...g.things.values()].filter((t) => g.reg.things.list[t.def].id === id);

describe("tech tiers and the old bunker (A4)", () => {
  it("layer 2 holds a sealed bunker with lockers", () => {
    const g = Game.create(content, { seed: "bunker", mapSize: 120, storyteller: "none" });
    // Surface, caves, deep; then two tower floors (N1).
    expect(g.map.layers.map((L) => L.level)).toEqual([0, -1, -2, 1, 2]);
    expect(things(g, "bunker_wall").filter((t) => t.layer === 2).length).toBeGreaterThan(40);
    expect(things(g, "bunker_locker").length).toBeGreaterThanOrEqual(8);
    // Two of the six rooms are sealed lairs (N1): their four doors are sealed doors.
    expect(things(g, "bunker_door").length).toBe(4);
    expect(things(g, "sealed_door").filter((t) => t.layer === 2).length).toBe(4);
  });

  it("salvage can turn up a blueprint the colony still needs, but not one it has", () => {
    const g = Game.create(content, { seed: "blueprint", mapSize: 96, storyteller: "none" });
    g.reg.things.get("loot_crate").blueprintChance = 1;
    for (const id of ["factory_manual", "plastics_manual", "electronics_manual"]) dropItems(g, id, 1, 0, g.home.x + 2, g.home.y + 2);
    const crate = things(g, "loot_crate").filter((t) => t.layer === 0).sort((a, b) => Math.hypot(a.x - g.home.x, a.y - g.home.y) - Math.hypot(b.x - g.home.x, b.y - g.home.y))[0];
    designate(g, "salvage", 0, crate.x, crate.y);
    run(g, 12);
    expect(g.things.has(crate.id)).toBe(false);
    // The only blueprint not in stock is the assembler schematic.
    expect(countItems(g, "assembler_schematic")).toBe(1);
    expect(countItems(g, "factory_manual")).toBe(1);
  });

  it("survivors dig stairs down from the caves to the bunker layer", () => {
    const g = Game.create(content, { seed: "dig", mapSize: 96, storyteller: "none" });
    g.research.done.add("deep_digging");
    const up = things(g, "stairs_up")[0];
    // A free cave tile next to the stairs up on layer 1.
    const L1 = g.map.layers[1];
    let spot: { x: number; y: number } | null = null;
    for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2], [2, 2], [-2, -2]]) {
      const x = up.x + dx, y = up.y + dy;
      if (L1.thing[L1.i(x, y)] === NO_THING && g.walkable(1, x, y)) {
        spot = { x, y };
        break;
      }
    }
    expect(spot).not.toBeNull();
    dropItems(g, "wood", 30, 1, up.x + 1, up.y);
    dropItems(g, "stone", 20, 1, up.x - 1, up.y);
    expect(placeBlueprint(g, "thing", "dug_stairs", 1, spot!.x, spot!.y)).not.toBeNull();
    run(g, 24);
    const below = g.map.layers[2];
    const t = below.thing[below.i(spot!.x, spot!.y)];
    expect(t).not.toBe(NO_THING);
    expect(g.reg.things.list[g.things.get(t)!.def].id).toBe("stairs_up");
    const [p] = [...g.pawns.values()].filter((c) => c.faction === "colony");
    expect(g.path.canReach(p, { layer: 2, x: spot!.x, y: spot!.y })).toBe(true);
  });

  it("a refinery turns fuel from its pipes into plastic", () => {
    const g = Game.create(content, { seed: "refinery", mapSize: 96, storyteller: "none" });
    g.research.done.add("plastics");
    const x0 = g.home.x - 16, y0 = g.home.y - 10;
    const L = g.map.layers[0];
    for (let y = y0 - 2; y <= y0 + 3; y++)
      for (let x = x0 - 1; x <= x0 + 8; x++) {
        const t = L.thing[L.i(x, y)];
        if (t !== NO_THING) g.removeThing(t);
        g.setTerrain(0, x, y, "dirt");
      }
    for (const p of g.pawns.values()) p.work = Object.fromEntries(WORK_TYPES.map((w) => [w, w === "craft" ? 1 : 0]));
    const tank = g.spawnThing("water_tank", 0, x0, y0);
    tank.liquid = { fuel: 100 };
    g.spawnThing("pipe", 0, x0 + 1, y0);
    const refinery = g.spawnThing("refinery", 0, x0 + 2, y0);
    const gen = g.spawnThing("scrap_generator", 0, x0 + 2, y0 - 1);
    gen.fuel = 30;
    run(g, 12);
    expect(countItems(g, "plastic")).toBeGreaterThanOrEqual(4);
    expect(tank.liquid?.fuel ?? 0).toBeLessThan(100);
    void refinery;
  });
});

describe("showcase way to the bunker", () => {
  it("a survivor on the surface can walk down the stairs and into the old bunker", async () => {
    const { buildShowcase } = await import("../src/index.ts");
    for (const seed of ["look1", "batt1", "showcase"]) {
      const g = Game.create(loadCoreContent(), { seed, mapSize: 200, storyteller: "none" });
      buildShowcase(g);
      g.rebuildDerived();
      const door = [...g.things.values()].filter((t) => t.layer === 2 && g.reg.things.list[t.def].id === "bunker_door").reduce((a, b) => (b.x < a.x ? b : a));
      const p = [...g.pawns.values()].find((q) => q.faction === "colony" && !q.robot)!;
      // A free floor tile in the first room (lockers stand in some spots).
      const L2 = g.map.layers[2];
      const inside = [1, 2, 3, 4, 5].flatMap((dx) => [-2, -1, 0, 1, 2].map((dy) => ({ x: door.x + dx, y: door.y + dy }))).find((q) => g.walkable(2, q.x, q.y) && L2.thing[L2.i(q.x, q.y)] === NO_THING)!;
      expect(g.path.canReach(p, { layer: 2, ...inside })).toBe(true);
    }
  });
});
