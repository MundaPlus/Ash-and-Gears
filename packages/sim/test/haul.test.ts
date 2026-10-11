import { describe, expect, it } from "vitest";
import { loadCoreContent } from "@wc/data";
import { createZone, doTileAction, dropItems, Game, haulList, isLit, NO_THING, setZoneAllow, setZoneFilter, setZoneItem, setZonePriority, storedCount, tileActions, WORK_TYPES, zoneTakes } from "../src/index.ts";

const content = loadCoreContent();
const run = (g: Game, hours: number) => {
  for (let i = 0, n = Math.round(hours * g.ticksPerHour); i < n; i++) g.step();
};

/** Drop a stack and return its id. */
function drop(g: Game, item: string, n: number, x: number, y: number): number {
  dropItems(g, item, n, 0, x, y);
  const L = g.map.layers[0];
  return L.item[L.i(x, y)];
}

/** A clear strip east of home with a 2x2 stockpile at its west end. */
function setup(seed: string) {
  const g = Game.create(content, { seed, mapSize: 96, storyteller: "none", idleWork: false });
  const x0 = g.home.x + 4, y0 = g.home.y - 12;
  const L = g.map.layers[0];
  for (let y = y0 - 1; y <= y0 + 3; y++)
    for (let x = x0 - 1; x <= x0 + 24; x++) {
      const t = L.thing[L.i(x, y)];
      if (t !== NO_THING) g.removeThing(t);
      g.setTerrain(0, x, y, "dirt");
    }
  for (const s of [...g.items.values()]) g.items.delete(s.id);
  for (const l of g.map.layers) l.item.fill(NO_THING);
  createZone(g, "stockpile", 0, [{ x: x0, y: y0 }, { x: x0 + 1, y: y0 }, { x: x0, y: y0 + 1 }, { x: x0 + 1, y: y0 + 1 }]);
  return { g, x0, y0 };
}

describe("haul list", () => {
  it("lists loose stacks closest to storage first and skips forbidden and stored ones", () => {
    const { g, x0, y0 } = setup("list");
    const far = drop(g, "scrap", 5, x0 + 20, y0 + 2);
    const near = drop(g, "scrap", 5, x0 + 5, y0 + 2);
    const stored = drop(g, "wood", 5, x0, y0);
    const forbidden = drop(g, "stone", 5, x0 + 8, y0 + 2);
    g.items.get(forbidden)!.forbidden = true;
    const ids = haulList(g).map((e) => e.id);
    expect(ids.indexOf(near)).toBeLessThan(ids.indexOf(far));
    expect(ids).not.toContain(stored);
    expect(ids).not.toContain(forbidden);
  });

  it("'haul now' puts a far stack first, and a hauler takes it before the near ones", () => {
    const { g, x0, y0 } = setup("now");
    haulList(g);
    // A fresh stack gets the action at once, before the haul list is rebuilt.
    const far = drop(g, "scrap", 5, x0 + 20, y0 + 2);
    const s = g.items.get(far)!;
    drop(g, "wood", 5, x0 + 4, y0 + 2);
    const at = { x: s.x, y: s.y };
    expect(tileActions(g, 0, at.x, at.y).actions).toContain("haul");
    expect(doTileAction(g, 0, at.x, at.y, "haul")).toBe(true);
    expect(haulList(g)[0]).toMatchObject({ id: far, urgent: true });
    expect(tileActions(g, 0, at.x, at.y).actions).not.toContain("haul");
    const pawns = [...g.pawns.values()].filter((p) => p.faction === "colony");
    for (const p of pawns) p.work = Object.fromEntries(WORK_TYPES.map((w) => [w, 0]));
    pawns[0].work = Object.fromEntries(WORK_TYPES.map((w) => [w, w === "haul" ? 4 : 0]));
    run(g, 0.2);
    expect(pawns[0].job?.kind === "haul" && pawns[0].job.targetId === far).toBe(true);
  });
});

describe("stored items and fires", () => {
  it("counts only items in stockpiles and chests as stored", () => {
    const { g, x0, y0 } = setup("stored");
    drop(g, "scrap", 5, x0, y0);
    drop(g, "scrap", 7, x0 + 15, y0 + 2);
    expect(storedCount(g, "scrap")).toBe(5);
  });

  it("a campfire burns wood and goes out; survivors bring more", () => {
    const { g, x0, y0 } = setup("fire");
    const fire = g.spawnThing("campfire", 0, x0 + 6, y0 + 1);
    fire.fuel = 1;
    run(g, 5);
    expect(fire.fuel).toBe(0);
    expect(isLit(g, fire)).toBe(false);
    drop(g, "wood", 20, x0 + 8, y0 + 2);
    for (const p of g.pawns.values()) if (p.faction === "colony") p.work = Object.fromEntries(WORK_TYPES.map((w) => [w, w === "haul" ? 1 : 0]));
    run(g, 3);
    expect(fire.fuel!).toBeGreaterThan(5);
    expect(isLit(g, fire)).toBe(true);
  });

  it("a stove burns wood only while someone cooks on it", () => {
    const { g, x0, y0 } = setup("stove");
    const stove = g.spawnThing("stove", 0, x0 + 6, y0 + 1);
    stove.fuel = 10;
    run(g, 3);
    expect(stove.fuel).toBe(10);
    drop(g, "glowcorn", 20, x0 + 9, y0 + 2);
    const cook = [...g.pawns.values()].find((p) => p.faction === "colony")!;
    for (const p of g.pawns.values()) if (p.faction === "colony") p.work = Object.fromEntries(WORK_TYPES.map((w) => [w, 0]));
    cook.work = Object.fromEntries(WORK_TYPES.map((w) => [w, w === "cook" ? 1 : 0]));
    run(g, 6);
    expect(stove.fuel!).toBeLessThan(10);
  });
});

describe("stockpile priority (B9)", () => {
  it("items move from a low stockpile to a high one, never back", () => {
    const { g, x0, y0 } = setup("prio");
    // The setup stockpile (x0..x0+1) is normal; a high one stands at the far end.
    const high = createZone(g, "stockpile", 0, [{ x: x0 + 20, y: y0 }, { x: x0 + 21, y: y0 }]);
    const low = drop(g, "scrap", 5, x0, y0);
    expect(haulList(g).some((e) => e.id === low)).toBe(false);
    setZonePriority(g, high.id, 3);
    expect(haulList(g).some((e) => e.id === low)).toBe(true);
    const pawns = [...g.pawns.values()].filter((p) => p.faction === "colony");
    for (const p of pawns) p.work = Object.fromEntries(WORK_TYPES.map((w) => [w, w === "haul" ? 1 : 0]));
    run(g, 3);
    const L = g.map.layers[0];
    const atHigh = [0, 1].map((k) => L.item[L.i(x0 + 20 + k, y0)]).filter((id) => id !== NO_THING).map((id) => g.items.get(id)!.count).reduce((a, b) => a + b, 0);
    expect(atHigh).toBe(5);
    expect(haulList(g).length).toBe(0);
  });
});

describe("stockpile spill-over (user request)", () => {
  it("loose items go to the best stockpile first, and spill to a lower one when it is full", () => {
    const { g, x0, y0 } = setup("spill");
    for (const p of g.pawns.values()) p.work = Object.fromEntries(WORK_TYPES.map((w) => [w, w === "haul" ? 1 : 0]));
    const [main] = [...g.zones.values()];
    // A high-priority stockpile far away, full of other stacks; the normal one is near.
    const high = createZone(g, "stockpile", 0, [{ x: x0 + 20, y: y0 }, { x: x0 + 21, y: y0 }]);
    setZonePriority(g, high.id, 3);
    drop(g, "stone", g.reg.items.get("stone").stack, x0 + 20, y0);
    drop(g, "wood", g.reg.items.get("wood").stack, x0 + 21, y0);
    const loose = drop(g, "scrap", 5, x0 + 10, y0 + 2);
    expect(haulList(g).some((e) => e.id === loose)).toBe(true);
    run(g, 3);
    expect(storedCount(g, "scrap")).toBe(5);
    const L = g.map.layers[0];
    const inMain = [...g.items.values()].some((s) => g.reg.items.list[s.def].id === "scrap" && L.zone[L.i(s.x, s.y)] === main.id);
    expect(inMain).toBe(true);
    // Room again in the high stockpile: the next stack goes there, though the normal one is nearer.
    const wood = L.item[L.i(x0 + 21, y0)];
    g.items.delete(wood);
    L.item[L.i(x0 + 21, y0)] = NO_THING;
    drop(g, "steel", 3, x0 + 4, y0 + 2);
    run(g, 3);
    const steel = [...g.items.values()].find((s) => g.reg.items.list[s.def].id === "steel")!;
    expect(L.zone[L.i(steel.x, steel.y)]).toBe(high.id);
  });
});

describe("idle survivors find their own work", () => {
  it("an idle survivor gives itself a salvage order near home, and the player's orders come first", () => {
    const g = Game.create(loadCoreContent(), { seed: "idle", mapSize: 96, storyteller: "none" });
    const near = [...g.things.values()].filter((t) => t.layer === 0 && g.reg.things.list[t.def].yield && g.reg.things.list[t.def].kind !== "plant" && !g.reg.things.list[t.def].build && Math.abs(t.x - g.home.x) < 25 && Math.abs(t.y - g.home.y) < 25);
    expect(near.length).toBeGreaterThan(0);
    for (const p of g.pawns.values()) p.work = Object.fromEntries(WORK_TYPES.map((w) => [w, w === "salvage" ? 1 : 0]));
    run(g, 1);
    expect(g.autoDesig.size).toBeGreaterThan(0);
    const busy = [...g.pawns.values()].filter((p) => p.faction === "colony" && p.job?.kind === "work").length;
    expect(busy).toBeGreaterThan(0);
  });
});

describe("stockpile item filter (N3)", () => {
  it("a scrap-only stockpile by a loader takes scrap and leaves wood for the others", () => {
    const { g, x0, y0 } = setup("itemfilter");
    for (const p of g.pawns.values()) p.work = Object.fromEntries(WORK_TYPES.map((w) => [w, w === "haul" ? 1 : 0]));
    const [main] = [...g.zones.values()];
    // The loader's own tile: scrap only, high priority. The main stockpile takes everything.
    createZone(g, "stockpile", 0, [{ x: x0 + 6, y: y0 }]);
    const feed = [...g.zones.values()].find((z) => z.id !== main.id)!;
    setZonePriority(g, feed.id, 3);
    setZoneFilter(g, feed.id, { allow: ["resource"], allowItems: ["scrap"] });
    g.spawnThing("loader", 0, x0 + 7, y0, 0);
    expect(zoneTakes(g, feed, g.reg.items.idx("scrap"))).toBe(true);
    expect(zoneTakes(g, feed, g.reg.items.idx("wood"))).toBe(false);
    drop(g, "wood", 5, x0 + 12, y0 + 2);
    drop(g, "scrap", 5, x0 + 14, y0 + 2);
    run(g, 6);
    const L = g.map.layers[0];
    const zoneOf = (item: string) => [...g.items.values()].filter((s) => g.reg.items.list[s.def].id === item).map((s) => L.zone[L.i(s.x, s.y)]);
    expect(zoneOf("scrap")).toEqual([feed.id]);
    expect(zoneOf("wood").every((z) => z === main.id)).toBe(true);
  });

  it("turning one item off makes the category partial and keeps the rest", () => {
    const { g } = setup("itemtoggle");
    const [z] = [...g.zones.values()];
    setZoneItem(g, z.id, "wood", false);
    expect(zoneTakes(g, z, g.reg.items.idx("wood"))).toBe(false);
    expect(zoneTakes(g, z, g.reg.items.idx("scrap"))).toBe(true);
    expect(z.allow).toContain("resource");
    setZoneAllow(g, z.id, "resource", true);
    expect(zoneTakes(g, z, g.reg.items.idx("wood"))).toBe(true);
  });
});
