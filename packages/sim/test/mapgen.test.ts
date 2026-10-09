import { describe, expect, it } from "vitest";
import { loadCoreContent } from "@wc/data";
import { Game, NO_THING } from "../src/index.ts";

const content = loadCoreContent();

function terrainHash(g: Game): number {
  let h = 0;
  for (const L of g.map.layers) for (const t of L.terrain) h = (Math.imul(h, 31) + t) | 0;
  return h;
}

/** Breadth-first search over walkable tiles of one layer. */
function reachable(g: Game, layer: number, sx: number, sy: number): Set<number> {
  const L = g.map.layers[layer];
  const seen = new Set<number>([L.i(sx, sy)]);
  const q: [number, number][] = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.pop()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (!g.walkable(layer, nx, ny)) continue;
      const i = L.i(nx, ny);
      if (!seen.has(i)) {
        seen.add(i);
        q.push([nx, ny]);
      }
    }
  }
  return seen;
}

describe("home map generation", () => {
  it("is deterministic for a seed", () => {
    const a = Game.create(content, { seed: "alpha", mapSize: 128 });
    const b = Game.create(content, { seed: "alpha", mapSize: 128 });
    const c = Game.create(content, { seed: "beta", mapSize: 128 });
    expect(terrainHash(a)).toBe(terrainHash(b));
    expect(a.things.size).toBe(b.things.size);
    expect(terrainHash(a)).not.toBe(terrainHash(c));
  });

  for (const seed of ["s1", "s2", "s3", "s4", "s5", "s6"]) {
    it(`seed ${seed}: start is open and stairs link both layers and are reachable`, () => {
      const g = Game.create(content, { seed, mapSize: 200 });
      const c = 100;
      expect(g.walkable(0, c, c)).toBe(true);
      const down = [...g.things.values()].find((t) => g.reg.things.list[t.def].id === "stairs_down")!;
      const up = [...g.things.values()].find((t) => g.reg.things.list[t.def].id === "stairs_up")!;
      expect(down).toBeDefined();
      expect(up).toBeDefined();
      expect([up.x, up.y]).toEqual([down.x, down.y]);
      expect(up.layer).toBe(1);
      const area = reachable(g, 0, c, c);
      expect(area.has(g.map.layers[0].i(down.x, down.y))).toBe(true);
      // The start area must be a real play area, not a closed pocket.
      expect(area.size).toBeGreaterThan(200 * 200 * 0.4);
    });
  }

  it("has ruins, wrecks, trees and loot on the surface", () => {
    const g = Game.create(content, { seed: "content-check" });
    const count = (id: string) => [...g.things.values()].filter((t) => g.reg.things.list[t.def].id === id).length;
    expect(count("ruin_wall")).toBeGreaterThan(50);
    expect(count("car_wreck")).toBeGreaterThan(3);
    expect(count("dead_tree")).toBeGreaterThan(20);
    expect(count("loot_crate")).toBeGreaterThan(1);
    const L1 = g.map.layers[1];
    const coal = g.reg.terrain.idx("coal_seam");
    expect(L1.terrain.some((t) => t === coal)).toBe(true);
    expect(L1.thing.some((t) => t !== NO_THING)).toBe(true);
  });
});
