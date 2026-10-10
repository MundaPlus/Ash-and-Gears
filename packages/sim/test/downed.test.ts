import { describe, expect, it } from "vitest";
import { loadCoreContent } from "@wc/data";
import { countItems, designate, Game, makeHostile, NO_THING, tileActions, WORK_TYPES } from "../src/index.ts";

const content = loadCoreContent();
const run = (g: Game, hours: number) => {
  for (let i = 0, n = Math.round(hours * g.ticksPerHour); i < n; i++) g.step();
};

/** A glow-hound without its hind legs, alone, near home (like the user's map). */
function legless(g: Game) {
  const { x, y } = g.home;
  const L = g.map.layers[0];
  for (let ty = y + 4; ty <= y + 8; ty++)
    for (let tx = x + 4; tx <= x + 8; tx++) {
      const t = L.thing[L.i(tx, ty)];
      if (t !== NO_THING) g.removeThing(t);
      g.setTerrain(0, tx, ty, "dirt");
    }
  const h = makeHostile(g, "glow_hound", "wild", 0, x + 6, y + 6, 99999, null);
  h.health.missing = ["l_leg", "r_leg"];
  h.health.downed = true;
  g.pawns.set(h.id, h);
  return h;
}

describe("downed creatures", () => {
  it("a downed wild animal whose pack is gone dies within a day", () => {
    const g = Game.create(content, { seed: "legless", mapSize: 96, storyteller: "none" });
    const h = legless(g);
    run(g, 12);
    expect(g.pawns.has(h.id)).toBe(true);
    run(g, 14);
    expect(g.pawns.has(h.id)).toBe(false);
  });

  it("a warden puts a downed animal down on order, and it leaves meat", () => {
    const g = Game.create(content, { seed: "putdown", mapSize: 96, storyteller: "none" });
    const h = legless(g);
    expect(tileActions(g, 0, h.x, h.y).actions).toContain("put_down");
    for (const p of g.pawns.values()) {
      if (p.faction !== "colony") continue;
      delete p.noWork;
      p.work = Object.fromEntries(WORK_TYPES.map((w) => [w, w === "warden" ? 1 : 0]));
    }
    const meat = countItems(g, "mutant_meat");
    expect(designate(g, "put_down", 0, h.x, h.y)).toBe(true);
    run(g, 3);
    expect(g.pawns.has(h.id)).toBe(false);
    expect(countItems(g, "mutant_meat")).toBeGreaterThan(meat);
  });
});

describe("stale orders", () => {
  it("a Put down order on a creature that already died goes away, and the warden does other work", () => {
    const g = Game.create(content, { seed: "stale", mapSize: 96, storyteller: "none" });
    const h = legless(g);
    expect(designate(g, "put_down", 0, h.x, h.y)).toBe(true);
    // The creature dies by itself before anyone comes.
    g.pawns.delete(h.id);
    const [w] = [...g.pawns.values()].filter((p) => p.faction === "colony");
    delete w.noWork;
    w.work = Object.fromEntries(WORK_TYPES.map((k) => [k, k === "warden" ? 1 : k === "haul" ? 2 : 0]));
    run(g, 1);
    const L = g.map.layers[0];
    expect(L.desig[L.i(h.x, h.y)]).toBe(0);
    expect(w.thinkCooldown).toBe(0);
  });
});

describe("the character menu (direct orders)", () => {
  it("offers attack on a standing enemy, put down on a downed one, and rescue and tend on a downed friend", async () => {
    const { pawnActions, doPawnAction } = await import("../src/index.ts");
    const g = Game.create(content, { seed: "menu", mapSize: 96, storyteller: "none" });
    const [a, friend] = [...g.pawns.values()].filter((p) => p.faction === "colony");
    const h = legless(g);
    const standing = makeHostile(g, "rad_rat", "wild", 0, g.home.x + 7, g.home.y + 7, 88888, null);
    g.pawns.set(standing.id, standing);
    expect(pawnActions(g, a, standing)).toEqual(["attack"]);
    expect(pawnActions(g, a, h)).toEqual(["put_down"]);
    // A downed friend with a wound, outside a bed.
    friend.health.injuries.push({ part: "l_leg", kind: "cut", dmg: 8, tended: 0 });
    friend.health.downed = true;
    g.spawnThing("scrap_bed", 0, g.home.x - 3, g.home.y - 3);
    const opts = pawnActions(g, a, friend);
    expect(opts).toContain("rescue");
    expect(opts).toContain("tend");
    // Put the hound down from the menu: the survivor goes at once.
    expect(doPawnAction(g, a, h, "put_down")).toBe(true);
    run(g, 1);
    expect(g.pawns.has(h.id)).toBe(false);
  });
});
