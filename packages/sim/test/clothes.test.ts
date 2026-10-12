import { describe, expect, it } from "vitest";
import { loadCoreContent } from "@wc/data";
import { comfortRange, createZone, dropItems, Game, loadGame, saveGame } from "../src/index.ts";

const content = loadCoreContent();
const item = (g: Game, id: string) => g.reg.items.idx(id);

/** A game in the given season (0..3) with a stockpile next to home. */
function make(season: number) {
  const g = Game.create(content, { seed: "clothes", mapSize: 64, storyteller: "none", layers: 1, upper: 0, idleWork: false });
  g.tick = g.ticksPerDay * g.opts.seasonDays * season + Math.round(g.ticksPerHour * 8);
  const { x, y } = g.home;
  const tiles = [];
  for (let dy = -6; dy <= -4; dy++) for (let dx = -2; dx <= 2; dx++) tiles.push({ x: x + dx, y: y + dy });
  createZone(g, "stockpile", 0, tiles);
  return g;
}
const colony = (g: Game) => [...g.pawns.values()].filter((p) => p.faction === "colony");
const run = (g: Game, hours: number) => {
  for (let i = 0; i < g.ticksPerHour * hours; i++) g.step();
};

describe("clothes", () => {
  it("survivors start in patched clothes, which keep them warm to a lower temperature", () => {
    const g = make(0);
    const p = colony(g)[0];
    expect(p.clothes).toBe(item(g, "patched_clothes"));
    const dressed = comfortRange(g, p);
    delete p.clothes;
    expect(comfortRange(g, p).min).toBeGreaterThan(dressed.min);
  });

  it("in winter a survivor puts on a coat from storage, and keeps the armor", () => {
    const g = make(3);
    const p = colony(g)[0];
    p.armor = [item(g, "rag_armor")];
    dropItems(g, "warm_coat", 1, 0, g.home.x, g.home.y - 5);
    run(g, 6);
    const wearing = colony(g).filter((q) => q.clothes === item(g, "warm_coat"));
    expect(wearing.length).toBe(1);
    expect(p.armor).toEqual([item(g, "rag_armor")]);
  });

  it("in summer a survivor takes the coat off, keeps the armor, and puts on light clothes if there are some", () => {
    const g = make(1);
    const [a, b] = colony(g);
    for (const p of [a, b]) {
      p.clothes = item(g, "warm_coat");
      p.armor = [item(g, "rag_armor")];
    }
    dropItems(g, "patched_clothes", 1, 0, g.home.x, g.home.y - 5);
    run(g, 6);
    const kinds = [a, b].map((p) => (p.clothes === undefined ? "none" : g.reg.items.list[p.clothes].id)).sort();
    expect(kinds).toEqual(["none", "patched_clothes"]);
    expect(a.armor).toEqual([item(g, "rag_armor")]);
    // The coats are not lost: they lie on the map or in storage.
    expect([...g.items.values()].filter((s) => s.def === item(g, "warm_coat")).length).toBe(2);
  });

  it("a coat is too hot for 21 °C outdoors, but not inside a room", () => {
    const g = make(1);
    const p = colony(g)[0];
    p.clothes = item(g, "warm_coat");
    expect(comfortRange(g, p).max).toBeLessThan(21);
    const L = g.map.layers[0];
    for (let y = p.y - 3; y <= p.y + 3; y++)
      for (let x = p.x - 3; x <= p.x + 3; x++) {
        if (Math.max(Math.abs(x - p.x), Math.abs(y - p.y)) !== 3) continue;
        const th = L.thing[L.i(x, y)];
        if (th !== -1) g.removeThing(th);
        g.spawnThing("wood_wall", 0, x, y);
      }
    g.rebuildDerived();
    expect(comfortRange(g, p).max).toBeGreaterThan(25);
  });

  it("clothes survive a save", () => {
    const g = make(0);
    const back = loadGame(content, JSON.parse(JSON.stringify(saveGame(g))));
    expect(colony(back)[0].clothes).toBe(item(back, "patched_clothes"));
  });
});
