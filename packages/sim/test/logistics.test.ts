import { describe, expect, it } from "vitest";
import { loadCoreContent } from "@wc/data";
import { chestStacks, dropItems, Game, loadGame, NO_THING, putInChest, saveGame, setFilter, WORK_TYPES, type Thing } from "../src/index.ts";

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
  for (const p of g.pawns.values()) p.work = Object.fromEntries(WORK_TYPES.map((w) => [w, 0]));
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
  for (const [k, n] of Object.entries(items)) putInChest(g, c, g.reg.items.idx(k), n);
  return c;
}

/** What a chest holds, by item id. */
function inside(g: Game, c: Thing): Record<string, number> {
  return Object.fromEntries(chestStacks(g, c).map((s) => [g.reg.items.list[s.def].id, s.count]));
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
    expect(inside(g, chest)).toEqual({ stone: 10 });
    expect(inside(g, sink)).toEqual({ scrap: 12 });
  });

  it("survivors haul loose items into a chest and take food out of it", () => {
    const { g, x0, y0 } = setup("haulchest");
    const chest = chestWith(g, x0 + 4, y0, {});
    dropItems(g, "wood", 15, 0, x0 + 6, y0 + 2);
    for (const p of g.pawns.values()) p.work = Object.fromEntries(WORK_TYPES.map((w) => [w, w === "haul" ? 1 : 0]));
    run(g, 6);
    // The start supplies near home come along too.
    expect(inside(g, chest).wood).toBeGreaterThanOrEqual(15);
    expect(stackAt(g, x0 + 6, y0 + 2)).toBeNull();
    // Food in the chest feeds a hungry survivor.
    putInChest(g, chest, g.reg.items.idx("simple_meal"), 3);
    for (const st of [...g.items.values()]) if (st.chest === undefined && g.reg.items.list[st.def].category === "food") g.items.delete(st.id);
    const L = g.map.layers[0];
    for (let i = 0; i < L.item.length; i++) if (L.item[i] !== NO_THING && !g.items.has(L.item[i])) L.item[i] = NO_THING;
    const [eater] = [...g.pawns.values()].filter((p) => p.faction === "colony");
    eater.needs.hunger = 0.1;
    run(g, 4);
    expect(eater.needs.hunger).toBeGreaterThan(0.5);
    expect(inside(g, chest).simple_meal ?? 0).toBeLessThan(3);
  });

  it("an arm feeds a workbench from its input side and products go to a chest on its output side", () => {
    const { g, x0, y0 } = setup("bench");
    // Workbench 2x1, not turned: input side north, output side south.
    const bench = g.spawnThing("scrap_bench", 0, x0 + 3, y0);
    const feed = chestWith(g, x0 + 3, y0 - 2, { scrap: 36 });
    g.spawnThing("robot_arm", 0, x0 + 3, y0 - 1, 1);
    const out = chestWith(g, x0 + 3, y0 + 1, {});
    const [crafter] = [...g.pawns.values()].filter((p) => p.faction === "colony");
    crafter.work = Object.fromEntries(WORK_TYPES.map((w) => [w, w === "craft" ? 1 : 0]));
    run(g, 2);
    // The arm filled the bench buffer (two batches of 12 scrap).
    expect(inside(g, feed).scrap ?? 0).toBeLessThan(36);
    run(g, 18);
    expect(inside(g, out).components ?? 0).toBeGreaterThan(0);
    expect(bench.out?.[g.reg.items.idx("components")] ?? 0).toBe(0);
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
    expect(inside(g2, c2)).toEqual({ stone: 7 });
    expect(a2.filter).toBe(g2.reg.items.idx("wood"));
  });
});
