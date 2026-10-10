import { describe, expect, it } from "vitest";
import { loadCoreContent } from "@wc/data";
import { canDesignate, countItems, designate, Game, NO_THING, WORK_TYPES } from "../src/index.ts";

const content = loadCoreContent();
const run = (g: Game, hours: number) => {
  for (let i = 0, n = Math.round(hours * g.ticksPerHour); i < n; i++) g.step();
};
const terrainAt = (g: Game, layer: number, x: number, y: number) => g.reg.terrain.list[g.map.layers[layer].terrain[g.map.layers[layer].i(x, y)]].id;
const things = (g: Game, id: string) => [...g.things.values()].filter((t) => g.reg.things.list[t.def].id === id);

describe("old floors and salvage (N4)", () => {
  it("survivors take up an old ruin floor: bare dirt and a little stone and scrap", () => {
    const g = Game.create(content, { seed: "oldfloor", mapSize: 96, storyteller: "none", idleWork: false });
    for (const p of g.pawns.values()) p.work = Object.fromEntries(WORK_TYPES.map((w) => [w, w === "construct" ? 1 : 0]));
    const x = g.home.x + 3, y = g.home.y + 3;
    const L = g.map.layers[0];
    const th = L.thing[L.i(x, y)];
    if (th !== NO_THING) g.removeThing(th);
    g.setTerrain(0, x, y, "ruin_floor");
    const stone = countItems(g, "stone"), scrap = countItems(g, "scrap");
    expect(designate(g, "unfloor", 0, x, y)).toBe(true);
    run(g, 6);
    expect(terrainAt(g, 0, x, y)).toBe("dirt");
    expect(countItems(g, "stone")).toBe(stone + 1);
    expect(countItems(g, "scrap")).toBe(scrap + 1);
  });

  it("plain ground and old floors under a wall cannot be taken up", () => {
    const g = Game.create(content, { seed: "oldfloor2", mapSize: 96, storyteller: "none" });
    const x = g.home.x + 4, y = g.home.y - 4;
    const L = g.map.layers[0];
    const th = L.thing[L.i(x, y)];
    if (th !== NO_THING) g.removeThing(th);
    g.setTerrain(0, x, y, "dirt");
    expect(canDesignate(g, "unfloor", 0, x, y)).toBe(false);
    g.setTerrain(0, x, y, "asphalt");
    expect(canDesignate(g, "unfloor", 0, x, y)).toBe(true);
    g.spawnThing("ruin_wall", 0, x, y);
    expect(canDesignate(g, "unfloor", 0, x, y)).toBe(false);
  });

  it("bunker walls, doors and lockers can be salvaged; stairs never", () => {
    const g = Game.create(content, { seed: "oldfloor3", mapSize: 120, storyteller: "none" });
    for (const id of ["bunker_wall", "bunker_door", "bunker_locker", "car_wreck"]) {
      const [t] = things(g, id);
      expect(canDesignate(g, "salvage", t.layer, t.x, t.y)).toBe(true);
    }
    for (const id of ["stairs_down", "stairs_up"]) {
      const [t] = things(g, id);
      expect(canDesignate(g, "salvage", t.layer, t.x, t.y)).toBe(false);
      expect(canDesignate(g, "deconstruct", t.layer, t.x, t.y)).toBe(false);
    }
    // A bunker floor tile with nothing on it.
    const L2 = g.map.layers[2];
    let spot: { x: number; y: number } | undefined;
    for (let i = 0; i < L2.terrain.length && !spot; i++) {
      const x = i % L2.w, y = Math.floor(i / L2.w);
      if (terrainAt(g, 2, x, y) === "bunker_floor" && L2.thing[i] === NO_THING) spot = { x, y };
    }
    expect(spot).toBeDefined();
    expect(canDesignate(g, "unfloor", 2, spot!.x, spot!.y)).toBe(true);
  });
});
