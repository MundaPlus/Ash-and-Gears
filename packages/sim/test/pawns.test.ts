import { describe, expect, it } from "vitest";
import { loadCoreContent } from "@wc/data";
import { countItems, dropItems, Game, type Pawn } from "../src/index.ts";

const content = loadCoreContent();

/** Small, fast test game: short days so needs move quickly. */
function smallGame(seed: string) {
  return Game.create(content, { seed, mapSize: 96, dayLengthSec: 120 });
}

function run(g: Game, days: number) {
  const n = Math.round(days * g.ticksPerDay);
  for (let i = 0; i < n; i++) g.step();
}

describe("pathfinding", () => {
  it("finds a path across the map and through the stairs", () => {
    const g = smallGame("path");
    const p = [...g.pawns.values()][0];
    const stairs = [...g.things.values()].find((t) => g.reg.things.list[t.def].id === "stairs_up")!;
    const path = g.path.find(p, { layer: 1, x: stairs.x, y: stairs.y });
    expect(path).not.toBeNull();
    expect(path!.at(-1)).toEqual({ layer: 1, x: stairs.x, y: stairs.y });
    // Every step is to a neighbor tile or a layer change on the same tile.
    let prev = { layer: p.layer, x: p.x, y: p.y };
    for (const s of path!) {
      if (s.layer !== prev.layer) expect([s.x, s.y]).toEqual([prev.x, prev.y]);
      else expect(Math.max(Math.abs(s.x - prev.x), Math.abs(s.y - prev.y))).toBe(1);
      expect(g.walkable(s.layer, s.x, s.y)).toBe(true);
      prev = s;
    }
  });

  it("returns null for a sealed-off target", () => {
    const g = smallGame("sealed");
    const p = [...g.pawns.values()][0];
    // Solid rock deep underground, away from caves, is not walkable.
    const L = g.map.layers[1];
    let target = null;
    for (let i = 0; i < L.w * L.h && !target; i++) {
      const x = i % L.w, y = Math.floor(i / L.w);
      if (!g.walkable(1, x, y)) target = { layer: 1, x, y };
    }
    expect(g.path.find(p, target!)).toBeNull();
  });
});

describe("survivors", () => {
  it("start with three named survivors and supplies", () => {
    const g = smallGame("start");
    expect(g.pawns.size).toBe(3);
    const nicks = new Set([...g.pawns.values()].map((p) => p.nick));
    expect(nicks.size).toBe(3);
    expect(countItems(g, "canned_food")).toBe(30);
  });

  it("eat, drink and sleep to stay alive for 5 days with supplies", () => {
    const g = smallGame("survive");
    // Start supplies last about 5 days for 3 survivors. Add more so this test checks behavior, not stock.
    dropItems(g, "canned_food", 40, 0, g.home.x - 4, g.home.y - 3);
    dropItems(g, "clean_water", 40, 0, g.home.x - 4, g.home.y - 5);
    let minHunger = 1, minThirst = 1, slept = 0;
    const days = 5;
    for (let i = 0; i < days * g.ticksPerDay; i++) {
      g.step();
      for (const p of g.pawns.values()) {
        minHunger = Math.min(minHunger, p.needs.hunger);
        minThirst = Math.min(minThirst, p.needs.thirst);
        if (p.asleep) slept++;
      }
    }
    // Nobody starves or dies of thirst.
    expect(minHunger).toBeGreaterThan(0.03);
    expect(minThirst).toBeGreaterThan(0.03);
    expect(slept).toBeGreaterThan(0);
    // They really ate and drank from the supplies.
    expect(countItems(g, "canned_food")).toBeLessThan(70);
    for (const p of g.pawns.values()) {
      expect(Number.isFinite(p.mood)).toBe(true);
      expect(p.needs.rest).toBeGreaterThan(0);
    }
  });

  it("drink from dirty water when there are no jugs", () => {
    const g = smallGame("dirty");
    // Remove all water items.
    for (const s of [...g.items.values()]) if (g.reg.items.list[s.def].category === "water") {
      const L = g.map.layers[s.layer];
      L.item[L.i(s.x, s.y)] = -1;
      g.items.delete(s.id);
    }
    const p = [...g.pawns.values()][0];
    p.needs.thirst = 0.3;
    // Put a sludge pool next to home so the test does not depend on map luck.
    for (let dx = 4; dx < 7; dx++) g.setTerrain(0, g.home.x + dx, g.home.y - 4, "sludge");
    run(g, 0.3);
    expect(p.needs.thirst).toBeGreaterThan(0.5);
    const drankDirty = g.reg.thoughts.idx("drank_dirty");
    expect(p.memories.some((m) => m.thought === drankDirty)).toBe(true);
  });

  it("get hungry and unhappy without food, then sulk", () => {
    const g = smallGame("starve");
    for (const s of [...g.items.values()]) {
      const L = g.map.layers[s.layer];
      L.item[L.i(s.x, s.y)] = -1;
      g.items.delete(s.id);
    }
    dropItems(g, "clean_water", 60, 0, g.home.x + 2, g.home.y + 2);
    run(g, 3);
    const ps: Pawn[] = [...g.pawns.values()];
    expect(ps.every((p) => p.needs.hunger === 0)).toBe(true);
    expect(ps.every((p) => p.mood < 45)).toBe(true);
    expect(g.messages.some((m) => m.key === "msg.break_sulk")).toBe(true);
  });

  it("is deterministic", () => {
    const a = smallGame("det"), b = smallGame("det");
    run(a, 1);
    run(b, 1);
    const snap = (g: Game) => [...g.pawns.values()].map((p) => [p.x, p.y, p.needs.hunger.toFixed(6), p.job?.kind]);
    expect(snap(a)).toEqual(snap(b));
  });
});
