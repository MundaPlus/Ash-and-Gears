import { describe, expect, it } from "vitest";
import { loadCoreContent } from "@wc/data";
import {
  countItems,
  dropItems,
  Game,
  makeHostile,
  NO_THING,
  researchState,
  setResearch,
  tickTurrets,
  type Thing,
} from "../src/index.ts";

const content = loadCoreContent();
const newGame = (seed: string) => Game.create(content, { seed, mapSize: 96, storyteller: "none" });
const run = (g: Game, hours: number) => {
  for (let i = 0, n = Math.round(hours * g.ticksPerHour); i < n; i++) g.step();
};

function clearArea(g: Game, cx: number, cy: number, r: number) {
  const L = g.map.layers[0];
  for (let y = cy - r; y <= cy + r; y++)
    for (let x = cx - r; x <= cx + r; x++) {
      const t = L.thing[L.i(x, y)];
      if (t !== NO_THING) g.removeThing(t);
      const it = L.item[L.i(x, y)];
      if (it !== NO_THING) {
        g.items.delete(it);
        L.item[L.i(x, y)] = NO_THING;
      }
      g.setTerrain(0, x, y, "dirt");
    }
}

describe("research", () => {
  it("survivors research at a desk and unlock a project", () => {
    const g = newGame("research");
    const { x, y } = g.home;
    clearArea(g, x - 5, y - 5, 2);
    g.spawnThing("research_desk", 0, x - 5, y - 5);
    expect(setResearch(g, "rain_catchers")).toBe(true);
    run(g, 24);
    expect(g.research.done.has("rain_catchers")).toBe(true);
  });

  it("blueprint projects open once a researcher studies the manual at a desk (the manual stays)", () => {
    const g = newGame("bp");
    for (const r of ["scrap_power", "powered_tools", "conveyors", "smelting"]) g.research.done.add(r);
    expect(researchState(g, "auto_crafting")).toBe("needs_blueprint");
    const { x, y } = g.home;
    clearArea(g, x - 5, y - 5, 2);
    dropItems(g, "factory_manual", 1, 0, x + 3, y);
    // Found is not enough: it must be studied.
    expect(researchState(g, "auto_crafting")).toBe("needs_blueprint");
    g.spawnThing("research_desk", 0, x - 5, y - 5);
    run(g, 6);
    expect(g.research.studied.has("factory_manual")).toBe(true);
    expect(researchState(g, "auto_crafting")).toBe("available");
    expect(countItems(g, "factory_manual")).toBe(1);
  });

  it("the map has an old safe that holds the factory manual", () => {
    const g = newGame("safe");
    const safe = [...g.things.values()].find((t) => g.reg.things.list[t.def].id === "old_safe");
    expect(safe).toBeDefined();
    expect(g.reg.things.get("old_safe").yield).toHaveProperty("factory_manual");
  });
});

describe("power", () => {
  it("a generator powers a lamp once survivors bring wood; batteries store the surplus", () => {
    const g = newGame("power");
    const { x, y } = g.home;
    clearArea(g, x - 6, y - 6, 4);
    const gen = g.spawnThing("scrap_generator", 0, x - 9, y - 6);
    g.spawnThing("wire", 0, x - 7, y - 6);
    const lamp = g.spawnThing("lamp", 0, x - 6, y - 6);
    const bat = g.spawnThing("battery", 0, x - 7, y - 5);
    g.step();
    g.step();
    run(g, 0.2);
    expect(lamp.powered).toBe(false);
    run(g, 6);
    expect(gen.fuel).toBeGreaterThan(0);
    expect(lamp.powered).toBe(true);
    expect(bat.charge).toBeGreaterThan(0);
  });

  it("an unpowered turret does not shoot; a powered one does", () => {
    const g = newGame("turret");
    const { x, y } = g.home;
    clearArea(g, x + 8, y, 5);
    const turret = g.spawnThing("scrap_turret", 0, x + 8, y);
    const rat = makeHostile(g, "rad_rat", "wild", 0, x + 12, y, 0, null);
    g.pawns.set(rat.id, rat);
    const fx0 = g.fx.length;
    for (let i = 0; i < 100; i++) tickTurrets(g);
    expect(g.fx.length).toBe(fx0);
    (turret as Thing).powered = true;
    for (let i = 0; i < 100; i++) tickTurrets(g);
    expect(g.fx.length).toBeGreaterThan(fx0);
  });
});

describe("logistics", () => {
  it("a loader puts a stack on a belt and the belt carries it to the end", () => {
    const g = newGame("belt");
    const { x, y } = g.home;
    clearArea(g, x - 6, y - 8, 5);
    // Power: a fueled generator next to the loader, wire under nothing else.
    const gen = g.spawnThing("scrap_generator", 0, x - 11, y - 9);
    gen.fuel = 30;
    g.spawnThing("wire", 0, x - 9, y - 9);
    g.spawnThing("wire", 0, x - 8, y - 9);
    // Stack behind the loader (west), loader faces east onto a 4-tile belt.
    for (const p of g.pawns.values()) p.work = { haul: 0, construct: 0 };
    dropItems(g, "stone", 20, 0, x - 9, y - 8);
    g.spawnThing("loader", 0, x - 8, y - 8, 0);
    for (let i = 0; i < 4; i++) g.spawnThing("conveyor", 0, x - 7 + i, y - 8, 0);
    run(g, 3);
    const L = g.map.layers[0];
    const endStack = L.item[L.i(x - 3, y - 8)];
    expect(endStack).not.toBe(NO_THING);
    expect(g.items.get(endStack)!.count).toBeGreaterThan(5);
  });

  it("an auto-crafter makes components from scrap with no survivor at the bench", () => {
    const g = newGame("crafter");
    const { x, y } = g.home;
    clearArea(g, x - 6, y - 6, 4);
    g.research.done.add("auto_crafting");
    const gen = g.spawnThing("scrap_generator", 0, x - 9, y - 6);
    gen.fuel = 30;
    const crafter = g.spawnThing("auto_crafter", 0, x - 7, y - 6, 0);
    crafter.recipe = "make_components";
    dropItems(g, "scrap", 75, 0, x - 4, y - 3);
    const c0 = countItems(g, "components");
    run(g, 12);
    expect(countItems(g, "components")).toBeGreaterThan(c0 + 1);
  });
});
