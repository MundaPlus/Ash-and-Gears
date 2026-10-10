import { describe, expect, it } from "vitest";
import { loadCoreContent } from "@wc/data";
import { createZone, doTileAction, dropItems, Game, NO_THING, placeBlueprint, setZoneAllow, tileActions } from "../src/index.ts";

const content = loadCoreContent();
const newGame = () => Game.create(content, { seed: "actions", mapSize: 96, storyteller: "none" });
const find = (g: Game, id: string) => [...g.things.values()].find((t) => t.layer === 0 && g.reg.things.list[t.def].id === id)!;

describe("tile actions", () => {
  it("offers salvage on a wreck as the default, then cancel once ordered", () => {
    const g = newGame();
    const car = find(g, "car_wreck");
    expect(tileActions(g, 0, car.x, car.y).first).toBe("salvage");
    expect(doTileAction(g, 0, car.x, car.y, "salvage")).toBe(true);
    expect(tileActions(g, 0, car.x, car.y)).toEqual({ actions: ["cancel_order"], first: "cancel_order" });
    doTileAction(g, 0, car.x, car.y, "cancel_order");
    expect(g.map.layers[0].desig[g.map.layers[0].i(car.x, car.y)]).toBe(0);
  });

  it("never makes deconstruct the default, and cancels plans", () => {
    const g = newGame();
    const { x, y } = g.home;
    const L = g.map.layers[0];
    for (let yy = y - 6; yy <= y - 4; yy++) for (let xx = x - 6; xx <= x - 4; xx++) {
      const t = L.thing[L.i(xx, yy)];
      if (t !== NO_THING) g.removeThing(t);
      g.setTerrain(0, xx, yy, "dirt");
    }
    g.spawnThing("scrap_wall", 0, x - 5, y - 5);
    const a = tileActions(g, 0, x - 5, y - 5);
    expect(a.actions).toContain("deconstruct");
    expect(a.first).toBeNull();
    placeBlueprint(g, "thing", "scrap_wall", 0, x - 6, y - 6);
    expect(tileActions(g, 0, x - 6, y - 6).first).toBe("cancel_plan");
    doTileAction(g, 0, x - 6, y - 6, "cancel_plan");
    expect(L.blueprint[L.i(x - 6, y - 6)]).toBe(NO_THING);
  });

  it("survivors leave forbidden stacks alone, and stockpile filters keep categories out", () => {
    const g = newGame();
    const { x, y } = g.home;
    const L = g.map.layers[0];
    for (const p of g.pawns.values()) p.work = { haul: 1 };
    const zone = createZone(g, "stockpile", 0, [{ x: x + 3, y: y - 3 }, { x: x + 4, y: y - 3 }]);
    dropItems(g, "stone", 10, 0, x - 3, y + 3);
    expect(doTileAction(g, 0, x - 3, y + 3, "forbid")).toBe(true);
    expect(tileActions(g, 0, x - 3, y + 3).actions).toContain("allow");
    for (let i = 0, n = g.ticksPerHour * 4; i < n; i++) g.step();
    expect(L.item[L.i(x - 3, y + 3)]).not.toBe(NO_THING);
    setZoneAllow(g, zone.id, "resource", false);
    expect(g.zones.get(zone.id)!.allow).not.toContain("resource");
  });
});
