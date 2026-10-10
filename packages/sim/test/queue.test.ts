import { describe, expect, it } from "vitest";
import { loadCoreContent } from "@wc/data";
import { countItems, dropItems, Game, NO_THING, queueAdd, queueSet, queueUp, setBillTarget, WORK_TYPES } from "../src/index.ts";

const content = loadCoreContent();
const run = (g: Game, hours: number) => {
  for (let i = 0, n = Math.round(hours * g.ticksPerHour); i < n; i++) g.step();
};

describe("make queue", () => {
  it("holds 5 orders, stacks the same recipe, reorders, and a crafter works through it in order", () => {
    const g = Game.create(content, { seed: "queue", mapSize: 96, storyteller: "none" });
    const x0 = g.home.x - 10, y0 = g.home.y - 8;
    const L = g.map.layers[0];
    for (let y = y0 - 1; y <= y0 + 4; y++)
      for (let x = x0 - 1; x <= x0 + 8; x++) {
        const t = L.thing[L.i(x, y)];
        if (t !== NO_THING) g.removeThing(t);
        g.setTerrain(0, x, y, "dirt");
      }
    g.research.done.add("field_medicine");
    g.research.done.add("gunsmithing");
    const bench = g.spawnThing("scrap_bench", 0, x0, y0);
    // No stock bills: only the queue makes things.
    for (const r of ["make_components", "make_bandages", "make_machete", "make_pipe_pistol", "make_crossbow"]) setBillTarget(g, bench.id, r, 0);
    expect(queueAdd(g, bench, "make_bandages", 1)).toBe(true);
    expect(queueAdd(g, bench, "make_bandages", 1)).toBe(true);
    expect(bench.queue).toEqual([{ recipe: "make_bandages", left: 2 }]);
    queueAdd(g, bench, "make_machete");
    queueAdd(g, bench, "make_components");
    queueAdd(g, bench, "make_crossbow");
    queueAdd(g, bench, "make_pipe_pistol");
    expect(queueAdd(g, bench, "make_bandages")).toBe(false);
    expect(bench.queue!.length).toBe(5);
    queueSet(bench, 4, 0);
    queueSet(bench, 3, 0);
    queueSet(bench, 1, 0);
    queueUp(bench, 1);
    expect(bench.queue!.map((o) => o.recipe)).toEqual(["make_components", "make_bandages"]);
    dropItems(g, "scrap", 40, 0, x0 + 4, y0 + 2);
    dropItems(g, "cloth", 10, 0, x0 + 5, y0 + 2);
    const crafter = [...g.pawns.values()].find((p) => p.faction === "colony")!;
    for (const p of g.pawns.values()) p.work = Object.fromEntries(WORK_TYPES.map((w) => [w, 0]));
    crafter.work = Object.fromEntries(WORK_TYPES.map((w) => [w, w === "craft" ? 1 : 0]));
    const comps0 = countItems(g, "components"), band0 = countItems(g, "bandage");
    run(g, 12);
    expect(countItems(g, "components")).toBeGreaterThan(comps0);
    expect(countItems(g, "bandage")).toBeGreaterThan(band0);
    expect(bench.queue!.length).toBe(0);
  });
});
