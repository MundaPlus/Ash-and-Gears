import { describe, expect, it } from "vitest";
import { loadCoreContent } from "@wc/data";
import { countItems, createZone, designate, dropItems, Game, NO_THING, setGrowPaused, WORK_TYPES } from "../src/index.ts";

const content = loadCoreContent();
const run = (g: Game, hours: number) => {
  for (let i = 0, n = Math.round(hours * g.ticksPerHour); i < n; i++) g.step();
};

/** No food anywhere; a cleared field east of home. */
function hungry(seed: string) {
  const g = Game.create(content, { seed, mapSize: 96, storyteller: "none", idleWork: false });
  const { x, y } = g.home;
  const L = g.map.layers[0];
  for (let ty = y - 8; ty <= y + 8; ty++)
    for (let tx = x - 8; tx <= x + 8; tx++) {
      const t = L.thing[L.i(tx, ty)];
      if (t !== NO_THING) g.removeThing(t);
      g.setTerrain(0, tx, ty, "rich_soil");
    }
  for (const s of [...g.items.values()]) if (g.reg.items.list[s.def].category === "food") {
    const SL = g.map.layers[s.layer];
    SL.item[SL.i(s.x, s.y)] = NO_THING;
    g.items.delete(s.id);
  }
  const colony = [...g.pawns.values()].filter((p) => p.faction === "colony");
  for (const p of colony) delete p.noWork;
  return { g, x, y, colony };
}

describe("starving survivors (user report)", () => {
  it("a starving, sulking survivor picks a ripe crop and eats it", () => {
    const { g, x, y, colony } = hungry("forage");
    const corn = g.spawnThing("glowcorn_plant", 0, x + 4, y);
    corn.growth = 1;
    const [p] = colony;
    p.needs.hunger = 0.05;
    p.mentalBreak = { kind: "sulk", until: g.tick + g.ticksPerHour * 12 };
    for (const q of colony) q.work = Object.fromEntries(WORK_TYPES.map((w) => [w, 0]));
    run(g, 2);
    expect(p.needs.hunger).toBeGreaterThan(0.2);
  });

  it("growers harvest and sow before they cut trees", () => {
    const { g, x, y, colony } = hungry("farmfirst");
    const field = [];
    for (let dx = 2; dx <= 5; dx++) for (let dy = -2; dy <= 1; dy++) field.push({ x: x + dx, y: y + dy });
    createZone(g, "grow", 0, field, undefined, "glowcorn_plant");
    const ripe = g.spawnThing("glowcorn_plant", 0, x + 2, y - 2);
    ripe.growth = 1;
    for (let k = 0; k < 8; k++) {
      g.spawnThing("dead_tree", 0, x - 6 + k, y + 6);
      designate(g, "cut", 0, x - 6 + k, y + 6);
    }
    for (const q of colony) {
      q.work = Object.fromEntries(WORK_TYPES.map((w) => [w, w === "grow" ? 1 : 0]));
      q.needs.hunger = 1;
    }
    run(g, 2);
    const L = g.map.layers[0];
    // The ripe crop is in, and new seeds are in the ground.
    expect(L.thing[L.i(x + 2, y - 2)] === NO_THING || (g.things.get(L.thing[L.i(x + 2, y - 2)])!.growth ?? 0) < 1).toBe(true);
    expect(countItems(g, "glowcorn") > 0 || field.filter((f) => L.thing[L.i(f.x, f.y)] !== NO_THING).length >= 4).toBe(true);
  });

  it("a cook does not feed the campfire when there is nothing to cook", () => {
    const { g, x, y, colony } = hungry("coldcook");
    const fire = g.spawnThing("campfire", 0, x + 3, y + 3);
    fire.fuel = 0;
    dropItems(g, "wood", 30, 0, x - 3, y - 3);
    for (const q of colony) {
      q.work = Object.fromEntries(WORK_TYPES.map((w) => [w, w === "cook" ? 1 : 0]));
      q.needs.hunger = 1;
    }
    run(g, 3);
    expect(fire.fuel ?? 0).toBe(0);
  });
});

describe("grow zone stop/start (user request)", () => {
  it("nobody sows a stopped grow zone, but ripe crops still get harvested", () => {
    const { g, x, y, colony } = hungry("growpause");
    for (const p of colony) p.work = Object.fromEntries(WORK_TYPES.map((w) => [w, w === "grow" ? 1 : 0]));
    const tiles = [];
    for (let ty = y + 2; ty <= y + 4; ty++) for (let tx = x - 1; tx <= x + 1; tx++) tiles.push({ x: tx, y: ty });
    const z = createZone(g, "grow", 0, tiles, undefined, "glowcorn_plant")!;
    const ripe = g.spawnThing("glowcorn_plant", 0, x, y + 3);
    ripe.growth = 1;
    setGrowPaused(g, z.id, true);
    run(g, 6);
    const plants = [...g.things.values()].filter((t) => g.reg.things.list[t.def].id === "glowcorn_plant");
    expect(plants.length).toBe(0);
    expect(g.things.has(ripe.id)).toBe(false);
    setGrowPaused(g, z.id, false);
    run(g, 6);
    expect([...g.things.values()].filter((t) => g.reg.things.list[t.def].id === "glowcorn_plant").length).toBeGreaterThan(0);
  });
});
