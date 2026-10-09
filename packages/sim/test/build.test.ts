import { describe, expect, it } from "vitest";
import { loadCoreContent } from "@wc/data";
import {
  countItems,
  createZone,
  designate,
  dropItems,
  Game,
  NO_THING,
  outdoorTemp,
  placeBlueprint,
  roomAt,
  tempAt,
} from "../src/index.ts";

const content = loadCoreContent();
// Normal day length: work is measured in ticks, so short days would make building take more in-game hours.
const smallGame = (seed: string) => Game.create(content, { seed, mapSize: 96, storyteller: "none" });
const run = (g: Game, hours: number) => {
  for (let i = 0, n = Math.round(hours * g.ticksPerHour); i < n; i++) g.step();
};
const thingId = (g: Game, layer: number, x: number, y: number) => {
  const L = g.map.layers[layer];
  const t = L.thing[L.i(x, y)];
  return t === NO_THING ? null : g.reg.things.list[g.things.get(t)!.def].id;
};

/** Clear a square around (cx, cy) so building tests do not depend on map luck. */
function clearArea(g: Game, cx: number, cy: number, r: number) {
  for (let y = cy - r; y <= cy + r; y++)
    for (let x = cx - r; x <= cx + r; x++) {
      const L = g.map.layers[0];
      const t = L.thing[L.i(x, y)];
      if (t !== NO_THING) g.removeThing(t);
      g.setTerrain(0, x, y, "dirt");
    }
}

/** Blueprints for a square room outline with a door in the bottom wall. */
function roomOutline(g: Game, x0: number, y0: number, size: number, wall = "scrap_wall") {
  for (let x = x0; x < x0 + size; x++)
    for (let y = y0; y < y0 + size; y++) {
      const edge = x === x0 || y === y0 || x === x0 + size - 1 || y === y0 + size - 1;
      if (!edge) continue;
      const door = x === x0 + Math.floor(size / 2) && y === y0 + size - 1;
      placeBlueprint(g, "thing", door ? "scrap_door" : wall, 0, x, y);
    }
}

describe("construction", () => {
  it("survivors build an enclosed, roofed room from scrap", () => {
    const g = smallGame("build-room");
    const { x: hx, y: hy } = g.home;
    clearArea(g, hx - 10, hy - 10, 5);
    dropItems(g, "scrap", 150, 0, hx + 3, hy + 5);
    roomOutline(g, hx - 13, hy - 13, 6);
    const scrap0 = countItems(g, "scrap");
    run(g, 30);
    expect(g.blueprints.size).toBe(0);
    expect(thingId(g, 0, hx - 13, hy - 13)).toBe("scrap_wall");
    expect(thingId(g, 0, hx - 10, hy - 8)).toBe("scrap_door");
    const room = roomAt(g, 0, hx - 11, hy - 11)!;
    expect(room.outdoor).toBe(false);
    expect(room.size).toBe(16);
    const L = g.map.layers[0];
    expect(L.roof[L.i(hx - 11, hy - 11)]).toBe(1);
    // 19 walls x 5 + 1 door x 6 = 101 scrap.
    expect(scrap0 - countItems(g, "scrap")).toBe(101);
  });

  it("a campfire keeps a closed room warmer than the night outside", () => {
    const g = smallGame("warm");
    const { x: hx, y: hy } = g.home;
    clearArea(g, hx - 10, hy - 10, 5);
    dropItems(g, "scrap", 150, 0, hx + 3, hy + 5);
    roomOutline(g, hx - 13, hy - 13, 6);
    placeBlueprint(g, "thing", "campfire", 0, hx - 11, hy - 11);
    run(g, 40);
    expect([...g.blueprints.values()].map((b) => `${g.reg.things.list[b.def].id}@${b.x - hx},${b.y - hy} need ${JSON.stringify(b.need)}`)).toEqual([]);
    // Jump to a night hour and let the room settle.
    while (Math.floor(g.hourOfDay) !== 3) g.step();
    const inside = tempAt(g, 0, hx - 10, hy - 10);
    const outside = outdoorTemp(g, 0);
    expect(inside).toBeGreaterThan(outside + 5);
  });

  it("deconstructing gives back 75% of the cost", () => {
    const g = smallGame("decon");
    const { x: hx, y: hy } = g.home;
    clearArea(g, hx - 10, hy - 10, 3);
    g.spawnThing("scrap_bed", 0, hx - 10, hy - 10);
    const scrap0 = countItems(g, "scrap"), cloth0 = countItems(g, "cloth");
    expect(designate(g, "salvage", 0, hx - 10, hy - 10)).toBe(true);
    run(g, 10);
    expect(thingId(g, 0, hx - 10, hy - 10)).toBeNull();
    expect(countItems(g, "scrap") - scrap0).toBe(11);
    expect(countItems(g, "cloth") - cloth0).toBe(3);
  });
});

describe("blueprint replacing", () => {
  it("a door blueprint replaces a wall blueprint and refunds what was delivered", () => {
    const g = smallGame("replace");
    const { x, y } = g.home;
    clearArea(g, x - 6, y - 6, 2);
    const wall = placeBlueprint(g, "thing", "scrap_wall", 0, x - 6, y - 6)!;
    wall.need[g.reg.items.idx("scrap")] = 2; // 3 of 5 already delivered
    const scrap0 = countItems(g, "scrap");
    const door = placeBlueprint(g, "thing", "scrap_door", 0, x - 6, y - 6);
    expect(door).not.toBeNull();
    expect(g.blueprints.has(wall.id)).toBe(false);
    expect(countItems(g, "scrap")).toBe(scrap0 + 3);
    // The same blueprint again is not a change.
    expect(placeBlueprint(g, "thing", "scrap_door", 0, x - 6, y - 6)).toBeNull();
  });
});

describe("orders", () => {
  it("salvaging a car wreck removes it and drops scrap", () => {
    const g = smallGame("salvage");
    const { x: hx, y: hy } = g.home;
    clearArea(g, hx + 8, hy, 2);
    g.spawnThing("car_wreck", 0, hx + 8, hy);
    const scrap0 = countItems(g, "scrap");
    designate(g, "salvage", 0, hx + 8, hy);
    run(g, 12);
    expect(thingId(g, 0, hx + 8, hy)).toBeNull();
    expect(countItems(g, "scrap")).toBeGreaterThan(scrap0 + 10);
  });

  it("mining rock next to the underground stairs opens the tile and drops stone", () => {
    const g = smallGame("mine");
    const up = [...g.things.values()].find((t) => g.reg.things.list[t.def].id === "stairs_up")!;
    const L = g.map.layers[1];
    // Find a rock tile next to the cave around the stairs.
    let target: { x: number; y: number } | null = null;
    for (let r = 2; r < 8 && !target; r++)
      for (let dx = -r; dx <= r && !target; dx++) {
        const x = up.x + dx, y = up.y - r;
        if (L.inBounds(x, y) && g.reg.terrain.list[L.terrain[L.i(x, y)]].id === "rock" && g.walkable(1, x, y + 1)) target = { x, y };
      }
    expect(target).not.toBeNull();
    designate(g, "mine", 1, target!.x, target!.y);
    run(g, 16);
    expect(g.walkable(1, target!.x, target!.y)).toBe(true);
    expect(countItems(g, "stone")).toBeGreaterThan(0);
  });

  it("haulers move loose items into a stockpile", () => {
    const g = smallGame("haul");
    const { x: hx, y: hy } = g.home;
    const tiles = [];
    for (let y = hy - 6; y < hy - 2; y++) for (let x = hx - 3; x < hx + 3; x++) tiles.push({ x, y });
    const zone = createZone(g, "stockpile", 0, tiles);
    run(g, 12);
    const L = g.map.layers[0];
    const stored = [...g.items.values()].filter((s) => L.zone[L.i(s.x, s.y)] === zone.id);
    expect(stored.length).toBeGreaterThanOrEqual(4);
  });
});
