import { describe, expect, it } from "vitest";
import { loadCoreContent } from "@wc/data";
import { Game, makeHostile, NO_THING, placeBlueprint, WORK_TYPES } from "../src/index.ts";

const content = loadCoreContent();
const run = (g: Game, hours: number) => {
  for (let i = 0, n = Math.round(hours * g.ticksPerHour); i < n; i++) g.step();
};

function field(seed: string) {
  const g = Game.create(content, { seed, mapSize: 96, storyteller: "none" });
  const x = g.home.x + 8, y = g.home.y;
  const L = g.map.layers[0];
  for (let ty = y - 4; ty <= y + 4; ty++)
    for (let tx = x - 4; tx <= x + 4; tx++) {
      const t = L.thing[L.i(tx, ty)];
      if (t !== NO_THING) g.removeThing(t);
      g.setTerrain(0, tx, ty, "dirt");
    }
  return { g, x, y };
}
const hurt = (p: { health: { injuries: unknown[] } }) => p.health.injuries.length > 0;

describe("traps (user request)", () => {
  it("need research before they can be planned", () => {
    const { g, x, y } = field("traps0");
    expect(placeBlueprint(g, "thing", "spike_trap", 0, x, y)).toBeNull();
    g.research.done.add("traps");
    expect(placeBlueprint(g, "thing", "spike_trap", 0, x, y)).not.toBeNull();
    expect(placeBlueprint(g, "thing", "blast_trap", 0, x + 1, y)).toBeNull();
  });

  it("a spike trap hurts an enemy who steps on it, survivors walk over it, and builders re-arm it", () => {
    const { g, x, y } = field("traps1");
    const trap = g.spawnThing("spike_trap", 0, x, y);
    const [p] = [...g.pawns.values()].filter((o) => o.faction === "colony");
    p.x = x;
    p.y = y;
    for (let i = 0; i < 6; i++) g.step();
    expect(trap.sprung).toBeFalsy();
    const hound = makeHostile(g, "glow_hound", "wild", 0, x, y, g.newId(), null);
    g.pawns.set(hound.id, hound);
    for (let i = 0; i < 6; i++) g.step();
    expect(trap.sprung).toBe(true);
    expect(hurt(hound)).toBe(true);
    g.pawns.delete(hound.id);
    for (const o of g.pawns.values()) if (o.faction === "colony") o.work = Object.fromEntries(WORK_TYPES.map((w) => [w, w === "construct" ? 1 : 0]));
    run(g, 3);
    expect(trap.sprung).toBeFalsy();
  });

  it("a blast trap burns every enemy close by and is gone", () => {
    const { g, x, y } = field("traps2");
    for (const r of ["traps", "explosive_traps"]) g.research.done.add(r);
    const trap = g.spawnThing("blast_trap", 0, x, y);
    const gid = g.newId();
    const a = makeHostile(g, "glow_hound", "wild", 0, x, y, gid, null);
    const b = makeHostile(g, "glow_hound", "wild", 0, x + 2, y, gid, null);
    const far = makeHostile(g, "glow_hound", "wild", 0, x + 4, y + 3, gid, null);
    for (const o of [a, b, far]) g.pawns.set(o.id, o);
    for (let i = 0; i < 4; i++) g.step();
    expect(g.things.has(trap.id)).toBe(false);
    // Used up, but planned again: builders rebuild it until the player deconstructs it.
    const L = g.map.layers[0];
    const bp = g.blueprints.get(L.blueprint[L.i(x, y)]);
    expect(bp && g.reg.things.list[bp.def].id).toBe("blast_trap");
    expect(hurt(a) && hurt(b)).toBe(true);
    expect(hurt(far)).toBe(false);
  });
});
