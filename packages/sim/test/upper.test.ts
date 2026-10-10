import { describe, expect, it } from "vitest";
import { loadCoreContent } from "@wc/data";
import { canPlace, cancelHaulNow, dropItems, fireEvent, Game, haulNow, isRoofed, NO_THING, placeBlueprint, WORK_TYPES } from "../src/index.ts";

const content = loadCoreContent();
const run = (g: Game, hours: number) => {
  for (let i = 0, n = Math.round(hours * g.ticksPerHour); i < n; i++) g.step();
};

/** Clear ground and a sealed 6x6 scrap room (door south), spawned at once. */
function room(g: Game, x0: number, y0: number) {
  const L = g.map.layers[0];
  for (let y = y0 - 3; y < y0 + 9; y++)
    for (let x = x0 - 3; x < x0 + 9; x++) {
      const t = L.thing[L.i(x, y)];
      if (t !== NO_THING) g.removeThing(t);
      g.setTerrain(0, x, y, "dirt");
    }
  for (let x = x0; x < x0 + 6; x++)
    for (let y = y0; y < y0 + 6; y++)
      if (x === x0 || y === y0 || x === x0 + 5 || y === y0 + 5) g.spawnThing(x === x0 + 2 && y === y0 + 5 ? "scrap_door" : "scrap_wall", 0, x, y);
  g.rebuildDerived();
}

describe("building upward (N1)", () => {
  it("wooden stairs in a room lead up, a plank deck goes over the room, and the room below counts as roofed", () => {
    const g = Game.create(content, { seed: "deck", mapSize: 96, storyteller: "none", idleWork: false });
    const { x, y } = g.home;
    const x0 = x + 4, y0 = y - 8;
    room(g, x0, y0);
    const up = g.map.above(0);
    for (const p of g.pawns.values()) {
      delete p.noWork;
      p.work = Object.fromEntries(WORK_TYPES.map((w) => [w, w === "construct" || w === "haul" ? 1 : 0]));
    }
    dropItems(g, "wood", 75, 0, x + 1, y + 1);
    // Outside the room there is nothing to hold a deck.
    expect(canPlace(g, "floor", "plank_deck", up, x0 - 2, y0 - 2)).toBe(false);
    expect(placeBlueprint(g, "thing", "wood_stairs", 0, x0 + 2, y0 + 2)).not.toBeNull();
    run(g, 8);
    const U = g.map.layers[up];
    const top = U.thing[U.i(x0 + 2, y0 + 2)];
    expect(top !== NO_THING && g.reg.things.list[g.things.get(top)!.def].id).toBe("stairs_down");
    // Lay the deck over the whole room, walls included.
    let planned = 0;
    for (let yy = y0; yy < y0 + 6; yy++) for (let xx = x0; xx < x0 + 6; xx++) if (placeBlueprint(g, "floor", "plank_deck", up, xx, yy)) planned++;
    expect(planned).toBeGreaterThanOrEqual(30);
    run(g, 24);
    expect(g.walkable(up, x0 + 4, y0 + 4)).toBe(true);
    expect(isRoofed(g, 0, x0 + 3, y0 + 3)).toBe(true);
  });

  it("rogue bots come in from the map edge", () => {
    const g = Game.create(content, { seed: "bots", mapSize: 96, storyteller: "none" });
    g.story.points = 12;
    fireEvent(g, "rogue_bots");
    const bots = [...g.pawns.values()].filter((p) => g.reg.content.creatures[p.creature].id === "rogue_bot" && p.layer === 0);
    expect(bots.length).toBeGreaterThanOrEqual(2);
  });

  it("the haul mark can be taken off again", () => {
    const g = Game.create(content, { seed: "haulmark", mapSize: 96, storyteller: "none" });
    dropItems(g, "scrap", 10, 0, g.home.x + 6, g.home.y + 6);
    const L = g.map.layers[0];
    const id = L.item[L.i(g.home.x + 6, g.home.y + 6)];
    const before = L.chunkVersion.reduce((a, v) => a + v, 0);
    expect(haulNow(g, id)).toBe(true);
    // The tile redraws, so the arrow shows.
    expect(L.chunkVersion.reduce((a, v) => a + v, 0)).toBeGreaterThan(before);
    expect(g.items.get(id)!.haulNow).toBe(true);
    cancelHaulNow(g, id);
    expect(g.items.get(id)!.haulNow).toBeUndefined();
  });
});
