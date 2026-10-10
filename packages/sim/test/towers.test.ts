import { describe, expect, it } from "vitest";
import { loadCoreContent } from "@wc/data";
import { designate, Game, isDormant, isRoofed, loadGame, saveGame, WORK_TYPES } from "../src/index.ts";

const content = loadCoreContent();
const run = (g: Game, hours: number) => {
  for (let i = 0, n = Math.round(hours * g.ticksPerHour); i < n; i++) g.step();
};
const things = (g: Game, id: string) => [...g.things.values()].filter((t) => g.reg.things.list[t.def].id === id);
const colony = (g: Game) => [...g.pawns.values()].filter((p) => p.faction === "colony" && !p.robot);

describe("towers with upper floors (N1)", () => {
  it("a tower rises above the surface, and survivors can walk up to its top floor", () => {
    const g = Game.create(content, { seed: "tower1", mapSize: 120, storyteller: "none" });
    const top = g.map.layerAt(2) >= 0 && things(g, "stairs_down").some((t) => t.layer === g.map.layerAt(2)) ? g.map.layerAt(2) : g.map.layerAt(1);
    const down = things(g, "stairs_down").find((t) => t.layer === top)!;
    expect(down).toBeDefined();
    const [p] = colony(g);
    expect(g.path.canReach(p, { layer: top, x: down.x, y: down.y })).toBe(true);
    // The ground floor under a tower floor counts as roofed; outside the tower the upper floor is air.
    expect(isRoofed(g, 0, down.x, down.y)).toBe(true);
    expect(g.walkable(top, 2, 2)).toBe(false);
  });

  it("a sealed room sleeps until survivors pry its door open", () => {
    const g = Game.create(content, { seed: "tower2", mapSize: 120, storyteller: "none" });
    const lairs = [...g.groups.values()].filter((gr) => gr.kind === "lair");
    expect(lairs.length).toBeGreaterThanOrEqual(3);
    const lair = lairs.find((gr) => g.map.layers[gr.lair!.layer].level > 0)!;
    const members = [...g.pawns.values()].filter((p) => p.group === lair.id);
    expect(members.length).toBeGreaterThan(0);
    expect(members.every((p) => isDormant(g, p))).toBe(true);
    // Nobody moves in a sleeping lair.
    const before = members.map((p) => `${p.x},${p.y}`).join("|");
    run(g, 2);
    expect(members.filter((p) => g.pawns.has(p.id)).map((p) => `${p.x},${p.y}`).join("|")).toBe(before);
    // Pry the door open: the lair wakes up.
    const door = things(g, "sealed_door").find((t) => t.layer === lair.lair!.layer)!;
    for (const c of colony(g)) c.work = Object.fromEntries(WORK_TYPES.map((w) => [w, w === "construct" ? 1 : 0]));
    expect(designate(g, "pry", door.layer, door.x, door.y)).toBe(true);
    let woke = false;
    for (let h = 0; h < 24 && !woke; h++) {
      run(g, 1);
      woke = !g.groups.get(lair.id)?.dormant;
    }
    expect(woke).toBe(true);
    expect(things(g, "rusted_door").some((t) => t.x === door.x && t.y === door.y)).toBe(true);
  });

  it("an old save without tower floors gets them, with towers on free ground", () => {
    const g = Game.create(content, { seed: "tower3", mapSize: 120, storyteller: "none", upper: 0 });
    expect(g.map.layers.length).toBe(3);
    const raw = JSON.parse(JSON.stringify(saveGame(g)));
    delete raw.opts.upper;
    const back = loadGame(content, raw);
    expect(back.map.layers.map((L) => L.level)).toEqual([0, -1, -2, 1, 2]);
    expect(things(back, "stairs_up").some((t) => t.layer === 0)).toBe(true);
    expect(things(back, "stairs_down").some((t) => back.map.layers[t.layer].level === 1)).toBe(true);
    // The colony is untouched and still first.
    expect([...back.pawns.values()][0].faction).toBe("colony");
  });

  it("sleeping lairs do not hold back the storyteller", () => {
    const g = Game.create(content, { seed: "tower4", mapSize: 120 });
    expect([...g.groups.values()].some((gr) => gr.kind === "lair")).toBe(true);
    run(g, 24 * 14);
    expect(g.story.log.length).toBeGreaterThan(0);
  });
});
