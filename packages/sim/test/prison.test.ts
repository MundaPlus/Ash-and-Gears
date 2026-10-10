import { describe, expect, it } from "vitest";
import { loadCoreContent } from "@wc/data";
import { damage, dropItems, Game, hostile, loadGame, makeHostile, makePrisoner, NO_THING, release, saveGame, setCapture, setPrisonBed, WORK_TYPES, type Pawn } from "../src/index.ts";

const content = loadCoreContent();
const run = (g: Game, hours: number) => {
  for (let i = 0, n = Math.round(hours * g.ticksPerHour); i < n; i++) g.step();
};
const colonists = (g: Game) => [...g.pawns.values()].filter((p) => p.faction === "colony");

/** A game with a clear area west of home, a prisoner bed in it, and one warden (the others idle). */
function setup(seed: string) {
  const g = Game.create(content, { seed, mapSize: 96, storyteller: "none" });
  const x0 = g.home.x - 10, y0 = g.home.y - 6;
  const L = g.map.layers[0];
  for (let y = y0 - 2; y <= y0 + 4; y++)
    for (let x = x0 - 2; x <= x0 + 8; x++) {
      const t = L.thing[L.i(x, y)];
      if (t !== NO_THING) g.removeThing(t);
      g.setTerrain(0, x, y, "dirt");
    }
  const bed = g.spawnThing("scrap_bed", 0, x0, y0);
  setPrisonBed(g, bed, true);
  const [warden, ...rest] = colonists(g);
  warden.work = Object.fromEntries(WORK_TYPES.map((w) => [w, w === "warden" ? 1 : 0]));
  for (const p of rest) p.work = Object.fromEntries(WORK_TYPES.map((w) => [w, 0]));
  return { g, x0, y0, bed, warden };
}

function downedRaider(g: Game, x: number, y: number): Pawn {
  const r = makeHostile(g, "human", "raiders", 0, x, y, 0, "pipe");
  g.pawns.set(r.id, r);
  damage(g, r, 20, "cut", "l_leg");
  damage(g, r, 20, "cut", "r_leg");
  r.health.bloodLoss = 0.6;
  r.health.bloodLoss = 0.7;
  damage(g, r, 1, "cut", "torso");
  r.health.downed = true;
  return r;
}

describe("prisoners and recruiting (A6)", () => {
  it("a warden carries a downed raider marked for capture to the prisoner bed", () => {
    const { g, x0, y0, bed } = setup("capture");
    const r = downedRaider(g, x0 + 6, y0 + 2);
    expect(r.health.downed).toBe(true);
    setCapture(g, r, true);
    run(g, 6);
    expect(r.faction).toBe("prisoner");
    expect([r.x, r.y]).toEqual([bed.x, bed.y]);
    // Nobody fights a prisoner.
    expect(hostile(colonists(g)[0], r)).toBe(false);
  });

  it("wardens feed prisoners, talk them down and recruit them", () => {
    const { g, x0, y0, bed, warden } = setup("recruit");
    const r = downedRaider(g, x0 + 1, y0 + 2);
    r.health.injuries = [];
    r.health.bloodLoss = 0;
    r.health.downed = false;
    makePrisoner(g, r, bed);
    r.resistance = 3;
    r.needs.hunger = 0.2;
    dropItems(g, "simple_meal", 5, 0, x0 + 4, y0 + 2);
    warden.skills[g.reg.skills.idx("social")].level = 12;
    run(g, 6);
    expect(r.needs.hunger).toBeGreaterThan(0.4);
    run(g, 72);
    expect(r.faction).toBe("colony");
  });

  it("a released prisoner leaves, and prisoners survive a save", () => {
    const { g, x0, y0, bed } = setup("release");
    const r = downedRaider(g, x0 + 1, y0 + 2);
    r.health.injuries = [];
    r.health.bloodLoss = 0;
    r.health.downed = false;
    makePrisoner(g, r, bed);
    r.resistance = 9;
    const g2 = loadGame(content, JSON.parse(JSON.stringify(saveGame(g))));
    const r2 = g2.pawns.get(r.id)!;
    expect(r2.faction).toBe("prisoner");
    expect(r2.resistance).toBe(9);
    expect(g2.things.get(bed.id)!.forPrisoners).toBe(true);
    release(g, r);
    run(g, 24);
    expect(g.pawns.has(r.id)).toBe(false);
  });
});
