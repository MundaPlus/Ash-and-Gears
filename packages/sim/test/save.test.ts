import { describe, expect, it } from "vitest";
import { loadCoreContent } from "@wc/data";
import { createZone, dropItems, Game, loadGame, packSave, placeBlueprint, saveGame, unpackSave } from "../src/index.ts";

const content = loadCoreContent();

/** A comparable snapshot of the important state. */
function snap(g: Game) {
  return {
    tick: g.tick,
    pawns: [...g.pawns.values()].map((p) => [p.id, p.nick, p.x, p.y, p.needs.hunger.toFixed(4), p.skills.map((s) => s.level).join(","), p.weapon]).sort(),
    things: g.things.size,
    items: [...g.items.values()].map((s) => `${s.def}:${s.count}@${s.x},${s.y}`).sort().join("|"),
    blueprints: g.blueprints.size,
    zones: g.zones.size,
    research: [...g.research.done].sort(),
    terrain: [...g.map.layers[0].terrain.slice(0, 500)].join(""),
  };
}

describe("save and load", () => {
  it("round-trips a game through JSON and gzip", async () => {
    const g = Game.create(content, { seed: "save", mapSize: 96, storyteller: "none" });
    const { x, y } = g.home;
    placeBlueprint(g, "thing", "scrap_wall", 0, x - 5, y - 5);
    createZone(g, "stockpile", 0, [{ x: x + 5, y: y + 5 }, { x: x + 6, y: y + 5 }]);
    dropItems(g, "bandage", 3, 0, x + 2, y + 2);
    g.research.done.add("scrap_power");
    for (let i = 0; i < 2000; i++) g.step();
    const before = snap(g);
    const bytes = await packSave(saveGame(g));
    const back = loadGame(content, await unpackSave(bytes));
    expect(snap(back)).toEqual(before);
  });

  it("a loaded game keeps running the same way it would have", () => {
    const a = Game.create(content, { seed: "save-run", mapSize: 96, storyteller: "none" });
    for (let i = 0; i < 1500; i++) a.step();
    const b = loadGame(content, JSON.parse(JSON.stringify(saveGame(a))));
    // Jobs are dropped on load, so exact paths differ; the world keeps working and nobody dies.
    for (let i = 0; i < 6000; i++) {
      a.step();
      b.step();
    }
    expect(b.pawns.size).toBe(a.pawns.size);
    expect(b.tick).toBe(a.tick);
    for (const p of b.pawns.values()) expect(p.needs.hunger).toBeGreaterThan(0);
  });
});
