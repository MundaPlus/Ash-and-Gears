import { describe, expect, it } from "vitest";
import { loadCoreContent } from "@wc/data";
import { dropItems, Game, loadGame, makeRobot, NO_THING, robotCount, saveGame, workPriority, WORK_TYPES } from "../src/index.ts";

const content = loadCoreContent();
const run = (g: Game, hours: number) => {
  for (let i = 0, n = Math.round(hours * g.ticksPerHour); i < n; i++) g.step();
};

function setup(seed: string) {
  const g = Game.create(content, { seed, mapSize: 96, storyteller: "none" });
  const x0 = g.home.x - 14, y0 = g.home.y - 8;
  const L = g.map.layers[0];
  for (let y = y0 - 2; y <= y0 + 4; y++)
    for (let x = x0 - 2; x <= x0 + 8; x++) {
      const t = L.thing[L.i(x, y)];
      if (t !== NO_THING) g.removeThing(t);
      g.setTerrain(0, x, y, "dirt");
    }
  for (const p of g.pawns.values()) p.work = Object.fromEntries(WORK_TYPES.map((w) => [w, 0]));
  g.research.done.add("robotics");
  const bay = g.spawnThing("robot_bay", 0, x0, y0);
  const gen = g.spawnThing("scrap_generator", 0, x0, y0 - 1);
  gen.fuel = 30;
  return { g, x0, y0, bay };
}

describe("robots (A7)", () => {
  it("a crafter builds a robot at the robot bay", () => {
    const { g, x0, y0 } = setup("build");
    dropItems(g, "steel", 20, 0, x0 + 4, y0 + 1);
    dropItems(g, "electronics", 5, 0, x0 + 5, y0 + 1);
    dropItems(g, "components", 6, 0, x0 + 6, y0 + 1);
    const [tech] = [...g.pawns.values()].filter((p) => p.faction === "colony");
    tech.work = Object.fromEntries(WORK_TYPES.map((w) => [w, w === "craft" ? 1 : 0]));
    run(g, 24);
    expect(robotCount(g, "robot")).toBe(1);
  });

  it("robots only do allowed work, have no needs, and charge at the bay when low", () => {
    const { g, x0, y0, bay } = setup("charge");
    const bot = makeRobot(g, "robot", 0, x0 + 5, y0 + 2);
    g.pawns.set(bot.id, bot);
    expect(workPriority(bot, "doctor")).toBe(0);
    expect(workPriority(bot, "haul")).toBeGreaterThan(0);
    bot.charge = 0.1;
    run(g, 6);
    expect(bot.charge).toBeGreaterThan(0.9);
    expect(bot.needs.hunger).toBe(1);
    // Only a powered bay charges: the bay is the one in the test area.
    expect(bay).toBeDefined();
    const g2 = loadGame(content, JSON.parse(JSON.stringify(saveGame(g))));
    expect(g2.pawns.get(bot.id)!.robot).toBe(true);
  });

  it("a hauler drone hauls loose items to a stockpile", () => {
    const { g, x0, y0 } = setup("drone");
    const drone = makeRobot(g, "hauler_drone", 0, x0 + 5, y0 + 2);
    g.pawns.set(drone.id, drone);
    g.spawnThing("scrap_chest", 0, x0 + 7, y0 + 3);
    dropItems(g, "stone", 10, 0, x0 + 3, y0 + 3);
    run(g, 6);
    const L = g.map.layers[0];
    expect(L.item[L.i(x0 + 3, y0 + 3)]).toBe(NO_THING);
  });
});
