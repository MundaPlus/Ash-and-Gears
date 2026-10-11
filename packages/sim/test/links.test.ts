import { describe, expect, it } from "vitest";
import { loadCoreContent } from "@wc/data";
import { applyScenario, Game, loadGame, NO_THING, saveGame } from "../src/index.ts";

const content = loadCoreContent();
const idOf = (g: Game, def: number) => g.reg.things.list[def].id;
const things = (g: Game, id: string) => [...g.things.values()].filter((t) => idOf(g, t.def) === id);
const surfaceStairs = (g: Game) => things(g, "stairs_down").filter((t) => t.layer === 0);
const bunkerDoor = (g: Game) => things(g, "bunker_door").filter((t) => t.layer === 2).reduce((a, b) => (b.x < a.x ? b : a));
const below = (g: Game, t: { layer: number; x: number; y: number }) => {
  const L = g.map.layers[t.layer + 1];
  const id = L.thing[L.i(t.x, t.y)];
  return id === NO_THING ? undefined : idOf(g, g.things.get(id)!.def);
};

describe("layer links (ensureLinks)", () => {
  it("a new game has surface stairs that lead on foot to the bunker door", () => {
    for (const seed of ["links1", "links2", "links3"]) {
      const g = Game.create(content, { seed, mapSize: 120, storyteller: "none" });
      const stairs = surfaceStairs(g);
      expect(stairs.length).toBeGreaterThan(0);
      for (const s of stairs) expect(below(g, s)).toBe("stairs_up");
      const door = bunkerDoor(g);
      const reach = stairs.some((s) => g.path.canReach({ layer: 0, x: s.x, y: s.y }, { layer: 2, x: door.x - 1, y: door.y }));
      expect(reach).toBe(true);
    }
  });

  it("missing surface stairs come back when the save is loaded", () => {
    const g = Game.create(content, { seed: "links-load", mapSize: 120, storyteller: "none" });
    const [s] = surfaceStairs(g);
    const { x, y } = s;
    g.removeThing(s.id);
    expect(surfaceStairs(g).some((t) => t.x === x && t.y === y)).toBe(false);
    const back = loadGame(content, JSON.parse(JSON.stringify(saveGame(g))));
    expect(surfaceStairs(back).some((t) => t.x === x && t.y === y)).toBe(true);
  });

  it("the Mall Rats store keeps the stairs it is built over", () => {
    const g = Game.create(content, { seed: "links-mall", mapSize: 120, storyteller: "none" });
    const [s] = surfaceStairs(g);
    // Put the store right over the stairs.
    g.home = { ...g.home, x: s.x + 2, y: s.y + 1 };
    g.opts.scenario = "mall";
    applyScenario(g);
    expect(g.things.has(s.id)).toBe(true);
    expect(below(g, s)).toBe("stairs_up");
  });

  it("a small map with the bunker near the edge still gets its tunnel (seed trapshot crashed)", () => {
    const g = Game.create(content, { seed: "trapshot", mapSize: 64 });
    expect(g.map.layers.length).toBeGreaterThan(2);
  });
});
