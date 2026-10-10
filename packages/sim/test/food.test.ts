import { describe, expect, it } from "vitest";
import { loadCoreContent } from "@wc/data";
import { WORK_TYPES, isRoofed, completeRoofs, contaminate, countItems, createZone, dropItems, exposureAt, Game, NO_THING, roomAt, scheduleRadCloud, tickWeather, type Pawn } from "../src/index.ts";

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

  it("a cook who does no hauling lights the cold campfire and cooks", () => {
    const g = newGame("coldfire");
    const { x: hx, y: hy } = g.home;
    clearArea(g, hx - 6, hy - 6, 3);
    const fire = g.spawnThing("campfire", 0, hx - 6, hy - 6);
    fire.fuel = 0;
    dropItems(g, "wood", 30, 0, hx - 4, hy - 8);
    dropItems(g, "glowcorn", 50, 0, hx - 3, hy - 3);
    // Cooking only: nobody hauls, so nobody else refuels the fire.
    for (const p of g.pawns.values()) p.work = Object.fromEntries(WORK_TYPES.map((w) => [w, w === "cook" ? 1 : 0]));
    run(g, 12);
    expect(fire.fuel ?? 0).toBeGreaterThan(0);
    expect(countItems(g, "simple_meal")).toBeGreaterThanOrEqual(2);
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
    // A second door outside the first makes an airlock, so the room is sealed.
    g.spawnThing("scrap_door", 0, hx - 9, hy - 5);
    g.spawnThing("scrap_wall", 0, hx - 10, hy - 5);
    g.spawnThing("scrap_wall", 0, hx - 8, hy - 5);
    completeRoofs(g);
    const room = roomAt(g, 0, hx - 9, hy - 9)!;
    expect(room.outdoor).toBe(false);
    expect(exposureAt(g, 0, hx - 9, hy - 9)).toBe("sealed");
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
    expect(outStack).toBeTruthy();
  });

  it("contaminates only by chance: open sky most, one door less, an airlock never", () => {
    const g = newGame("chance");
    const { x: hx, y: hy } = g.home;
    clearArea(g, hx, hy, 12);
    // Two rooms with a 6x6 inside each. Room A has one door, room B an airlock.
    spawnRoom(g, hx - 10, hy - 10, 8);
    spawnRoom(g, hx + 2, hy - 10, 8);
    g.spawnThing("scrap_door", 0, hx + 4, hy - 2);
    completeRoofs(g);
    // The outer door needs walls at its sides before the airlock counts.
    expect(exposureAt(g, 0, hx + 5, hy - 7)).toBe("leaky");
    g.spawnThing("scrap_wall", 0, hx + 3, hy - 2);
    g.spawnThing("scrap_wall", 0, hx + 5, hy - 2);
    g.step();
    expect(exposureAt(g, 0, hx - 7, hy - 7)).toBe("leaky");
    expect(exposureAt(g, 0, hx + 5, hy - 7)).toBe("sealed");
    const fill = (x0: number, y0: number, w: number, h: number) => {
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) dropItems(g, "canned_food", 5, 0, x, y);
    };
    fill(hx - 9, hy - 9, 6, 6);
    fill(hx + 3, hy - 9, 6, 6);
    fill(hx - 10, hy + 2, 20, 6);
    contaminate(g, "rad_cloud");
    const L = g.map.layers[0];
    const share = (x0: number, y0: number, w: number, h: number) => {
      let n = 0, bad = 0;
      for (let y = y0; y < y0 + h; y++)
        for (let x = x0; x < x0 + w; x++) {
          const s = g.items.get(L.item[L.i(x, y)]);
          if (!s) continue;
          n++;
          if (s.contaminated) bad++;
        }
      return bad / n;
    };
    const open = share(hx - 10, hy + 2, 20, 6);
    const leaky = share(hx - 9, hy - 9, 6, 6);
    expect(open).toBeGreaterThan(0.4);
    expect(open).toBeLessThan(0.8);
    expect(leaky).toBeLessThan(open);
    expect(share(hx + 3, hy - 9, 6, 6)).toBe(0);
  });

  it("survivors build the roof of a new room", () => {
    const g = newGame("roof");
    const { x: hx, y: hy } = g.home;
    clearArea(g, hx - 8, hy - 8, 4);
    spawnRoom(g, hx - 11, hy - 11, 6);
    g.step();
    const L = g.map.layers[0];
    expect(L.roof[L.i(hx - 9, hy - 9)]).toBe(0);
    expect(exposureAt(g, 0, hx - 9, hy - 9)).toBe("open");
    expect(g.roofTodo.size).toBe(32); // 4x4 inside + 16 side walls; corners need none
    run(g, 24);
    expect(g.roofTodo.size).toBe(0);
    expect(exposureAt(g, 0, hx - 9, hy - 9)).toBe("leaky");
  });
});

describe("shelter from radiation clouds", () => {
  it("survivors pass a leaky room and wait out the cloud in a room with an airlock", () => {
    const g = newGame("airlock");
    const { x: hx, y: hy } = g.home;
    clearArea(g, hx, hy, 14);
    // Close by: a roofed room whose door opens straight outside (leaky).
    spawnRoom(g, hx + 2, hy - 3, 6);
    // Further away: the same room with an airlock (sealed).
    spawnRoom(g, hx - 13, hy - 3, 6);
    g.spawnThing("scrap_door", 0, hx - 11, hy + 3);
    g.spawnThing("scrap_wall", 0, hx - 12, hy + 3);
    g.spawnThing("scrap_wall", 0, hx - 10, hy + 3);
    completeRoofs(g);
    expect(exposureAt(g, 0, hx + 4, hy - 1)).toBe("leaky");
    expect(exposureAt(g, 0, hx - 11, hy - 1)).toBe("sealed");
    g.step();
    scheduleRadCloud(g, 1);
    run(g, 3);
    expect(g.weather.kind).toBe("rad_cloud");
    for (const p of g.pawns.values()) if (p.faction === "colony") expect(exposureAt(g, p.layer, p.x, p.y)).toBe("sealed");
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
    for (const p of g.pawns.values()) if (p.faction === "colony") expect(g.map.layers[p.layer].underground || isRoofed(g, p.layer, p.x, p.y)).toBe(true);
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
    expect(countItems(g, "canned_food")).toBe(36);
  });
});

describe("eating at a table", () => {
  it("a hungry survivor carries the meal to a free chair at a table and eats there", () => {
    const g = Game.create(loadCoreContent(), { seed: "table", mapSize: 96, storyteller: "none" });
    const x0 = g.home.x + 4, y0 = g.home.y - 12;
    const L = g.map.layers[0];
    for (let y = y0 - 1; y <= y0 + 5; y++)
      for (let x = x0 - 1; x <= x0 + 12; x++) {
        const t = L.thing[L.i(x, y)];
        if (t !== NO_THING) g.removeThing(t);
        g.setTerrain(0, x, y, "dirt");
      }
    for (const s of [...g.items.values()]) if (g.reg.items.list[s.def].category === "food") g.items.delete(s.id);
    for (let i = 0; i < L.item.length; i++) if (L.item[i] !== NO_THING && !g.items.has(L.item[i])) L.item[i] = NO_THING;
    g.spawnThing("table", 0, x0 + 8, y0 + 2);
    const chair = g.spawnThing("chair", 0, x0 + 8, y0 + 3);
    dropItems(g, "simple_meal", 3, 0, x0, y0 + 2);
    const p = [...g.pawns.values()].find((q) => q.faction === "colony")!;
    p.x = x0 + 1;
    p.y = y0 + 2;
    p.needs.hunger = 0.3;
    let sat = false;
    for (let i = 0; i < g.ticksPerHour * 2; i++) {
      g.step();
      if (p.job?.kind === "eat" && p.job.stage === 2 && p.x === chair.x && p.y === chair.y) sat = true;
    }
    expect(sat).toBe(true);
    expect(p.needs.hunger).toBeGreaterThan(0.5);
    expect(p.memories.some((m) => g.reg.thoughts.list[m.thought].id === "ate_at_table")).toBe(true);
  });
});
