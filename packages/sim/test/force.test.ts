import { describe, expect, it } from "vitest";
import { loadCoreContent } from "@wc/data";
import { doTileForce, dropItems, Game, NO_THING, tileForceActions, WORK_TYPES, createZone } from "../src/index.ts";

const content = loadCoreContent();
const run = (g: Game, hours: number) => {
  for (let i = 0, n = Math.round(hours * g.ticksPerHour); i < n; i++) g.step();
};

function setup(seed: string) {
  const g = Game.create(content, { seed, mapSize: 96, storyteller: "none", idleWork: false });
  const { x, y } = g.home;
  const L = g.map.layers[0];
  for (let ty = y - 6; ty <= y + 6; ty++)
    for (let tx = x - 6; tx <= x + 6; tx++) {
      const t = L.thing[L.i(tx, ty)];
      if (t !== NO_THING) g.removeThing(t);
      g.setTerrain(0, tx, ty, "dirt");
    }
  const [a] = [...g.pawns.values()].filter((p) => p.faction === "colony");
  delete a.noWork;
  // All work off: only the player's word gets this survivor to do anything.
  for (const p of g.pawns.values()) p.work = Object.fromEntries(WORK_TYPES.map((w) => [w, 0]));
  return { g, a, x, y };
}

describe("forcing an order with a selected survivor", () => {
  it("mines a rock tile at once, even with mining off in the priorities", () => {
    const { g, a, x, y } = setup("force-mine");
    g.setTerrain(0, x + 3, y, "rock");
    expect(tileForceActions(g, a, 0, x + 3, y)).toContain("mine");
    expect(doTileForce(g, a, 0, x + 3, y, "mine")).toBe(true);
    run(g, 4);
    expect(g.reg.terrain.list[g.map.layers[0].terrain[g.map.layers[0].i(x + 3, y)]].solid).toBe(false);
  });

  it("cuts a plant and hauls a chosen stack to storage", () => {
    const { g, a, x, y } = setup("force-cut");
    g.spawnThing("dead_tree", 0, x + 2, y + 2);
    expect(doTileForce(g, a, 0, x + 2, y + 2, "cut")).toBe(true);
    run(g, 3);
    const L = g.map.layers[0];
    expect(L.thing[L.i(x + 2, y + 2)]).toBe(NO_THING);
    // Haul: a stack far from the stockpile goes there.
    createZone(g, "stockpile", 0, [{ x: x - 5, y: y - 5 }]);
    dropItems(g, "scrap", 10, 0, x + 5, y + 5);
    const id = L.item[L.i(x + 5, y + 5)];
    expect(tileForceActions(g, a, 0, x + 5, y + 5)).toContain("haul");
    expect(doTileForce(g, a, 0, x + 5, y + 5, "haul")).toBe(true);
    run(g, 2);
    const s = g.items.get(id);
    expect(!s || (s.x === x - 5 && s.y === y - 5)).toBe(true);
  });

  it("does not offer work the survivor's backstory rules out", () => {
    const { g, a, x, y } = setup("force-ban");
    g.setTerrain(0, x + 3, y, "rock");
    a.noWork = ["mine"];
    expect(tileForceActions(g, a, 0, x + 3, y)).not.toContain("mine");
  });
});
