import { describe, expect, it } from "vitest";
import { loadCoreContent } from "@wc/data";
import { daysToRot, dropCarried, dropItems, Game, pickUp, roomAt, useOf, type Thing } from "../src/index.ts";

const content = loadCoreContent();

/** A walled room (inside w x h) with its top-left inside tile at x0,y0. Rooms may share a wall. */
function room(g: Game, x0: number, y0: number, w: number, h: number, wall = "wood_wall") {
  const L = g.map.layers[0];
  for (let y = y0 - 1; y <= y0 + h; y++)
    for (let x = x0 - 1; x <= x0 + w; x++)
      if ((x === x0 - 1 || y === y0 - 1 || x === x0 + w || y === y0 + h) && L.thing[L.i(x, y)] === -1) g.spawnThing(wall, 0, x, y);
}

/** A new game with clear open ground where the test rooms go. */
function make() {
  const g = Game.create(content, { seed: "climate", mapSize: 64, storyteller: "none", layers: 1, upper: 0, idleWork: false });
  const L = g.map.layers[0];
  for (let y = 6; y <= 24; y++)
    for (let x = 6; x <= 26; x++) {
      const th = L.thing[L.i(x, y)];
      if (th !== -1) g.removeThing(th);
      g.setTerrain(0, x, y, "dirt");
    }
  return g;
}
/** Keep generators full, run `hours` from the given season (0..3) and hour. */
function run(g: Game, season: number, hour: number, hours: number) {
  g.tick = g.ticksPerDay * g.opts.seasonDays * season + Math.round(g.ticksPerHour * hour);
  for (let i = 0; i < g.ticksPerHour * hours; i++) {
    for (const t of g.things.values()) if (g.reg.things.list[t.def].id === "scrap_generator") t.fuel = 30;
    g.step();
  }
}
/** A device in the room with a generator next to it (they touch: one power network). */
function device(g: Game, id: string, x: number, y: number): Thing {
  const t = g.spawnThing(id, 0, x, y);
  g.spawnThing("scrap_generator", 0, x + 1, y);
  return t;
}

describe("heaters, coolers and vents", () => {
  it("a heater holds its room at the target in winter, in a small and a big room, and draws power as it works", () => {
    for (const size of [5, 9]) {
      const g = make();
      room(g, 10, 10, size, size);
      const h = device(g, "electric_heater", 11, 11);
      run(g, 3, 2, 24);
      expect(roomAt(g, 0, 12, 12)!.temp).toBeGreaterThan(19);
      expect(roomAt(g, 0, 12, 12)!.temp).toBeLessThan(23);
      expect(h.duty!).toBeGreaterThan(0);
      expect(useOf(g, h)).toBeLessThanOrEqual(150);
      if (size === 5) expect(useOf(g, h)).toBeLessThan(100);
    }
  });

  it("a cooler holds a summer room cool, and set below zero it makes a freezer where food does not rot", () => {
    const g = make();
    room(g, 10, 10, 5, 5, "stone_wall");
    const c = device(g, "electric_cooler", 11, 11);
    run(g, 1, 10, 6);
    expect(roomAt(g, 0, 12, 12)!.temp).toBeLessThan(23);
    c.target = -5;
    dropItems(g, "simple_meal", 5, 0, 13, 13);
    run(g, 1, 14, 24);
    expect(roomAt(g, 0, 12, 12)!.temp).toBeLessThan(0);
    const meal = [...g.items.values()].find((s) => g.reg.items.list[s.def].id === "simple_meal")!;
    expect(daysToRot(g, meal)).toBe(Infinity);
    expect(meal.rot ?? 0).toBeLessThan(0.2);
  });

  it("an idle heater draws only a little power", () => {
    const g = make();
    room(g, 10, 10, 5, 5);
    const h = device(g, "electric_heater", 11, 11);
    run(g, 1, 14, 4);
    expect(h.duty).toBe(0);
    expect(useOf(g, h)).toBeLessThan(10);
  });

  it("a vent in a shared wall lets the heat into the next room", () => {
    const temps: number[] = [];
    for (const vent of [false, true]) {
      const g = make();
      room(g, 10, 10, 5, 5);
      room(g, 16, 10, 5, 5);
      // The shared wall is x = 15; the second room's walls reuse it.
      const L = g.map.layers[0];
      if (vent) {
        g.removeThing(L.thing[L.i(15, 12)]);
        g.spawnThing("vent", 0, 15, 12);
      }
      device(g, "electric_heater", 11, 11);
      run(g, 3, 2, 24);
      temps.push(roomAt(g, 0, 18, 12)!.temp);
      expect(roomAt(g, 0, 18, 12)).not.toBe(roomAt(g, 0, 12, 12));
    }
    expect(temps[1]).toBeGreaterThan(temps[0] + 8);
  });
});

describe("food rot when food moves", () => {
  it("hauled food keeps its rot, and a merged stack takes the mean", () => {
    const g = make();
    const { x, y } = { x: 12, y: 12 };
    dropItems(g, "simple_meal", 4, 0, x, y, false, undefined, 0.5);
    const s = [...g.items.values()].find((t) => g.reg.items.list[t.def].id === "simple_meal")!;
    expect(s.rot).toBe(0.5);
    // Four fresh meals join: the stack is a quarter rotten.
    dropItems(g, "simple_meal", 4, 0, x, y);
    expect(s.rot).toBeCloseTo(0.25);
    // A survivor picks the stack up and drops it somewhere else: the rot comes along.
    const p = [...g.pawns.values()].find((q) => q.faction === "colony")!;
    pickUp(g, p, s.id, 8);
    expect(p.carrying!.rot).toBeCloseTo(0.25);
    p.x = 20;
    p.y = 20;
    dropCarried(g, p);
    const moved = [...g.items.values()].find((t) => g.reg.items.list[t.def].id === "simple_meal")!;
    expect(moved.rot).toBeCloseTo(0.25);
  });
});
