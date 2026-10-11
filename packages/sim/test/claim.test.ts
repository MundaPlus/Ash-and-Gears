import { describe, expect, it } from "vitest";
import { loadCoreContent } from "@wc/data";
import { canDesignate, designate, exposureAt, Game, NO_THING, placeBlueprint, WORK_TYPES } from "../src/index.ts";

const content = loadCoreContent();
const run = (g: Game, hours: number) => {
  for (let i = 0, n = Math.round(hours * g.ticksPerHour); i < n; i++) g.step();
};
const idAt = (g: Game, x: number, y: number) => g.thingDefAt(0, x, y)?.id;

/** A small ruin (5 x 5, one gap in the south wall) on clear ground east of home. Builders only. */
function ruin(seed: string) {
  const g = Game.create(content, { seed, mapSize: 96, storyteller: "none", idleWork: false });
  const x0 = g.home.x + 6, y0 = g.home.y - 2;
  const L = g.map.layers[0];
  for (let y = y0 - 1; y <= y0 + 5; y++)
    for (let x = x0 - 1; x <= x0 + 5; x++) {
      const i = L.i(x, y);
      if (L.thing[i] !== NO_THING) g.removeThing(L.thing[i]);
      if (L.item[i] !== NO_THING) {
        g.items.delete(L.item[i]);
        L.item[i] = NO_THING;
      }
      g.setTerrain(0, x, y, "ruin_floor");
    }
  const gap = { x: x0 + 2, y: y0 + 4 };
  for (let y = y0; y <= y0 + 4; y++)
    for (let x = x0; x <= x0 + 4; x++) {
      const edge = x === x0 || x === x0 + 4 || y === y0 || y === y0 + 4;
      if (edge && !(x === gap.x && y === gap.y)) g.spawnThing("ruin_wall", 0, x, y);
    }
  const colony = [...g.pawns.values()].filter((p) => p.faction === "colony");
  for (const p of colony) {
    delete p.noWork;
    p.work = Object.fromEntries(WORK_TYPES.map((w) => [w, w === "construct" ? 1 : 0]));
  }
  return { g, x0, y0, gap };
}

describe("claiming old buildings", () => {
  it("a ruin closed in with the colony's own door gets claimed and roofed", () => {
    const { g, x0, y0, gap } = ruin("claim1");
    run(g, 1);
    // Open ruin: nothing happens to it.
    expect(idAt(g, x0, y0)).toBe("ruin_wall");
    g.spawnThing("scrap_door", 0, gap.x, gap.y);
    run(g, 12);
    for (let x = x0; x <= x0 + 4; x++) expect(idAt(g, x, y0)).toBe("patched_wall");
    expect(exposureAt(g, 0, x0 + 2, y0 + 2)).not.toBe("open");
  });

  it("the Claim order patches one wall; claimed walls are the colony's own", () => {
    const { g, x0, y0 } = ruin("claim2");
    expect(canDesignate(g, "salvage", 0, x0, y0)).toBe(true);
    expect(designate(g, "claim", 0, x0, y0)).toBe(true);
    run(g, 4);
    expect(idAt(g, x0, y0)).toBe("patched_wall");
    expect(g.things.get(g.map.layers[0].thing[g.map.layers[0].i(x0, y0)])!.hp).toBe(320);
    // Own walls: deconstruct, not salvage. The patched wall is never in the build menu.
    expect(canDesignate(g, "salvage", 0, x0, y0)).toBe(false);
    expect(canDesignate(g, "deconstruct", 0, x0, y0)).toBe(true);
    expect(canDesignate(g, "claim", 0, x0, y0)).toBe(false);
    expect(placeBlueprint(g, "thing", "patched_wall", 0, x0 + 2, y0 + 2)).toBeNull();
  });
});

describe("food warning", () => {
  it("tells the player once when food runs low, again when it is nearly gone", () => {
    const g = Game.create(content, { seed: "foodwarn", mapSize: 96, storyteller: "none" });
    for (const s of [...g.items.values()]) if (g.reg.items.list[s.def].category === "food") {
      const L = g.map.layers[s.layer];
      L.item[L.i(s.x, s.y)] = NO_THING;
      g.items.delete(s.id);
    }
    run(g, 3);
    const told = g.messages.filter((m) => m.key === "msg.food_critical" || m.key === "msg.food_low");
    expect(told.map((m) => m.key)).toEqual(["msg.food_critical"]);
    expect(told[0].level).toBe("bad");
  });
});
