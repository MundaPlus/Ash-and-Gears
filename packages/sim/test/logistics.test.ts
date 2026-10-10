import { describe, expect, it } from "vitest";
import { loadCoreContent } from "@wc/data";
import { dropItems, Game, loadGame, NO_THING, saveGame, setFilter, type Thing } from "../src/index.ts";

const content = loadCoreContent();
const run = (g: Game, hours: number) => {
  for (let i = 0, n = Math.round(hours * g.ticksPerHour); i < n; i++) g.step();
};

/** A game with a clear 12x7 work area west of home, no survivor work, and its top-left corner. */
function setup(seed: string) {
  const g = Game.create(content, { seed, mapSize: 96, storyteller: "none" });
  const x0 = g.home.x - 16, y0 = g.home.y - 10;
  const L = g.map.layers[0];
  for (let y = y0 - 3; y <= y0 + 3; y++)
    for (let x = x0 - 1; x <= x0 + 10; x++) {
      const t = L.thing[L.i(x, y)];
      if (t !== NO_THING) g.removeThing(t);
      const it = L.item[L.i(x, y)];
      if (it !== NO_THING) {
        g.items.delete(it);
        L.item[L.i(x, y)] = NO_THING;
      }
      g.setTerrain(0, x, y, "dirt");
    }
  for (const p of g.pawns.values()) p.work = {};
  // Power: a fueled generator touching the second and third tile of the line.
  const gen = g.spawnThing("scrap_generator", 0, x0 + 1, y0 - 1);
  gen.fuel = 30;
  return { g, x0, y0 };
}

function stackAt(g: Game, x: number, y: number): { def: string; count: number } | null {
  const L = g.map.layers[0];
  const id = L.item[L.i(x, y)];
  if (id === NO_THING) return null;
  const s = g.items.get(id)!;
  return { def: g.reg.items.list[s.def].id, count: s.count };
}

function chestWith(g: Game, x: number, y: number, items: Record<string, number>): Thing {
  const c = g.spawnThing("scrap_chest", 0, x, y);
  c.store = Object.fromEntries(Object.entries(items).map(([k, n]) => [g.reg.items.idx(k), n]));
  return c;
}

describe("belt logistics (A1)", () => {
  it("a splitter shares packets between front, left and right", () => {
    const { g, x0, y0 } = setup("split");
    dropItems(g, "stone", 30, 0, x0, y0);
    g.spawnThing("loader", 0, x0 + 1, y0, 0);
    g.spawnThing("conveyor", 0, x0 + 2, y0, 0);
    g.spawnThing("belt_splitter", 0, x0 + 3, y0, 0);
    run(g, 4);
    expect(stackAt(g, x0 + 4, y0)?.count).toBeGreaterThan(0);
    expect(stackAt(g, x0 + 3, y0 - 1)?.count).toBeGreaterThan(0);
    expect(stackAt(g, x0 + 3, y0 + 1)?.count).toBeGreaterThan(0);
  });

  it("a sorter sends its item forward and everything else to the right", () => {
    const { g, x0, y0 } = setup("sort");
    chestWith(g, x0, y0, { stone: 10, wood: 10 });
    g.spawnThing("robot_arm", 0, x0 + 1, y0, 0);
    g.spawnThing("conveyor", 0, x0 + 2, y0, 0);
    const sorter = g.spawnThing("belt_sorter", 0, x0 + 3, y0, 0);
    setFilter(g, sorter, "wood");
    run(g, 6);
    expect(stackAt(g, x0 + 4, y0)).toEqual({ def: "wood", count: 10 });
    expect(stackAt(g, x0 + 3, y0 + 1)).toEqual({ def: "stone", count: 10 });
  });

  it("an underground belt carries items under a wall", () => {
    const { g, x0, y0 } = setup("tunnel");
    dropItems(g, "stone", 20, 0, x0, y0);
    g.spawnThing("loader", 0, x0 + 1, y0, 0);
    g.spawnThing("tunnel_in", 0, x0 + 2, y0, 0);
    g.spawnThing("stone_wall", 0, x0 + 3, y0);
    g.spawnThing("stone_wall", 0, x0 + 4, y0);
    g.spawnThing("tunnel_out", 0, x0 + 5, y0, 0);
    run(g, 4);
    expect(stackAt(g, x0 + 6, y0)).toEqual({ def: "stone", count: 20 });
  });

  it("a robot arm with a filter takes only its item out of a chest, and belts fill chests", () => {
    const { g, x0, y0 } = setup("arm");
    const chest = chestWith(g, x0, y0, { stone: 10, wood: 10 });
    const arm = g.spawnThing("robot_arm", 0, x0 + 1, y0, 0);
    setFilter(g, arm, "wood");
    // A second line fills another chest from a belt.
    dropItems(g, "scrap", 12, 0, x0 + 2, y0 - 2);
    g.spawnThing("loader", 0, x0 + 3, y0 - 2, 0);
    g.spawnThing("conveyor", 0, x0 + 4, y0 - 2, 0);
    const sink = chestWith(g, x0 + 5, y0 - 2, {});
    g.spawnThing("wire", 0, x0 + 3, y0 - 1);
    run(g, 4);
    expect(stackAt(g, x0 + 2, y0)).toEqual({ def: "wood", count: 10 });
    expect(chest.store).toEqual({ [g.reg.items.idx("stone")]: 10 });
    expect(sink.store?.[g.reg.items.idx("scrap")]).toBe(12);
  });

  it("chests, filters and crafter outputs survive a save", () => {
    const { g, x0, y0 } = setup("save");
    chestWith(g, x0, y0, { stone: 7 });
    const arm = g.spawnThing("robot_arm", 0, x0 + 1, y0, 0);
    setFilter(g, arm, "wood");
    const g2 = loadGame(content, JSON.parse(JSON.stringify(saveGame(g))));
    const L = g2.map.layers[0];
    const c2 = g2.things.get(L.thing[L.i(x0, y0)])!;
    const a2 = g2.things.get(L.thing[L.i(x0 + 1, y0)])!;
    expect(c2.store).toEqual({ [g2.reg.items.idx("stone")]: 7 });
    expect(a2.filter).toBe(g2.reg.items.idx("wood"));
  });
});
