import { describe, expect, it } from "vitest";
import { loadCoreContent } from "@wc/data";
import { countItems, createZone, dropItems, Game, NO_THING, roomAt, scheduleRadCloud, tickWeather, type Pawn } from "../src/index.ts";

const content = loadCoreContent();
const newGame = (seed: string) => Game.create(content, { seed, mapSize: 96, storyteller: "none" });
const run = (g: Game, hours: number) => {
  for (let i = 0, n = Math.round(hours * g.ticksPerHour); i < n; i++) g.step();
};

/** Flat dirt square with no things, so tests do not depend on map luck. */
function clearArea(g: Game, cx: number, cy: number, r: number, terrain = "dirt") {
  const L = g.map.layers[0];
  for (let y = cy - r; y <= cy + r; y++)
    for (let x = cx - r; x <= cx + r; x++) {
      const t = L.thing[L.i(x, y)];
      if (t !== NO_THING) g.removeThing(t);
      g.setTerrain(0, x, y, terrain);
    }
}

/** A sealed scrap room built instantly (walls spawned, not blueprints). */
function spawnRoom(g: Game, x0: number, y0: number, size: number) {
  for (let x = x0; x < x0 + size; x++)
    for (let y = y0; y < y0 + size; y++) {
      const edge = x === x0 || y === y0 || x === x0 + size - 1 || y === y0 + size - 1;
      if (edge) g.spawnThing(x === x0 + 2 && y === y0 + size - 1 ? "scrap_door" : "scrap_wall", 0, x, y);
    }
}

describe("farming", () => {
  it("survivors sow a grow zone and harvest glowcorn", () => {
    const g = newGame("farm");
    const { x: hx, y: hy } = g.home;
    clearArea(g, hx + 8, hy + 8, 3, "rich_soil");
    const tiles = [];
    for (let y = hy + 6; y <= hy + 10; y++) for (let x = hx + 6; x <= hx + 10; x++) tiles.push({ x, y });
    createZone(g, "stockpile", 0, [], undefined);
    createZone(g, "grow", 0, tiles, undefined, "glowcorn_plant");
    run(g, 24 * 6);
    const plants = [...g.things.values()].filter((t) => g.reg.things.list[t.def].id === "glowcorn_plant");
    expect(plants.length + countItems(g, "glowcorn")).toBeGreaterThan(0);
    // Rich soil grows glowcorn in about 4 days, so some was harvested by day 6.
    expect(countItems(g, "glowcorn")).toBeGreaterThan(20);
  });
});

describe("cooking and water", () => {
  it("a campfire turns raw food into meals up to the target", () => {
    const g = newGame("cook");
    const { x: hx, y: hy } = g.home;
    clearArea(g, hx - 6, hy - 6, 2);
    g.spawnThing("campfire", 0, hx - 6, hy - 6);
    dropItems(g, "glowcorn", 50, 0, hx - 3, hy - 3);
    dropItems(g, "scrub_potato", 30, 0, hx - 4, hy - 3);
    run(g, 24);
    // Target is 2 meals per survivor (6). Survivors may eat some meals as they appear.
    expect(countItems(g, "simple_meal")).toBeGreaterThanOrEqual(3);
    expect(countItems(g, "glowcorn") + countItems(g, "scrub_potato")).toBeLessThan(80);
  });

  it("survivors fill water jugs at a well", () => {
    const g = newGame("well");
    const { x: hx, y: hy } = g.home;
    clearArea(g, hx - 6, hy - 6, 2);
    g.spawnThing("well", 0, hx - 6, hy - 6);
    // Use up the start water so the target is not already met.
    for (const s of [...g.items.values()]) if (g.reg.items.list[s.def].id === "clean_water") s.count = 1;
    run(g, 12);
    expect(countItems(g, "clean_water")).toBeGreaterThanOrEqual(10);
  });
});

describe("radiation cloud", () => {
  it("hurts survivors outside, spares a sealed room, and contaminates what was outside", () => {
    const g = newGame("rad");
    const { x: hx, y: hy } = g.home;
    clearArea(g, hx - 8, hy - 8, 4);
    spawnRoom(g, hx - 11, hy - 11, 6);
    g.step(); // build rooms
    const room = roomAt(g, 0, hx - 9, hy - 9)!;
    expect(room.outdoor).toBe(false);
    const [inside, outside] = [...g.pawns.values()] as Pawn[];
    // No Rad-Hardened trait in this test, so doses are exact.
    inside.traits = [];
    outside.traits = [];
    // Food inside and outside.
    dropItems(g, "canned_food", 10, 0, hx - 9, hy - 9);
    dropItems(g, "glowcorn", 10, 0, hx + 6, hy + 6);
    // Hold the survivors in place: advance only the clock and the weather, not the pawn AI.
    inside.x = hx - 9; inside.y = hy - 9;
    outside.x = hx + 5; outside.y = hy + 5;
    const tickWorld = (hours: number) => {
      for (let i = 0, n = Math.round(hours * g.ticksPerHour); i < n; i++) {
        g.tick++;
        tickWeather(g);
      }
    };
    scheduleRadCloud(g, 1);
    tickWorld(2);
    expect(g.weather.kind).toBe("rad_cloud");
    // Ride out the cloud (it lasts 5-10 hours).
    tickWorld(11);
    expect(g.weather.kind).not.toBe("rad_cloud");
    expect(outside.rad).toBeGreaterThan(0.2);
    expect(inside.rad).toBeLessThan(0.05);
    const L = g.map.layers[0];
    const inStack = g.items.get(L.item[L.i(hx - 9, hy - 9)])!;
    const outStack = g.items.get(L.item[L.i(hx + 6, hy + 6)])!;
    expect(inStack.contaminated).toBeFalsy();
    expect(outStack.contaminated).toBe(true);
    expect(g.openWaterContamUntil).toBeGreaterThan(g.tick);
  });
});

describe("rot", () => {
  it("survivors run for shelter when a cloud is coming", () => {
    const g = newGame("shelter");
    const { x: hx, y: hy } = g.home;
    clearArea(g, hx - 8, hy - 8, 4);
    spawnRoom(g, hx - 11, hy - 11, 6);
    g.step();
    scheduleRadCloud(g, 1);
    run(g, 4);
    expect(g.weather.kind).toBe("rad_cloud");
    for (const p of g.pawns.values()) expect(p.layer > 0 || g.map.layers[0].roof[g.map.layers[0].i(p.x, p.y)] === 1).toBe(true);
  });

  it("meals rot in a few warm days but cans do not", () => {
    const g = newGame("rot");
    // Remove survivors so nobody eats the test food.
    g.pawns.clear();
    g.weatherTempOffset = 0;
    const { x: hx, y: hy } = g.home;
    dropItems(g, "simple_meal", 5, 0, hx + 4, hy + 4);
    run(g, 24 * 12);
    expect(countItems(g, "simple_meal")).toBe(0);
    expect(countItems(g, "canned_food")).toBe(30);
  });
});
