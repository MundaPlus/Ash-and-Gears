import { describe, expect, it } from "vitest";
import { loadCoreContent } from "@wc/data";
import { dropItems, Game, hackRobot, loadGame, makeHostile, makeRobot, NO_THING, robotCount, saveGame, workPriority, WORK_TYPES } from "../src/index.ts";

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

describe("tier 4 robots (B6)", () => {
  it("each specialist does only its own work", () => {
    const { g, x0, y0 } = setup("t4");
    const kinds = { builder_bot: "construct", miner_bot: "mine", farmer_bot: "grow", guard_bot: "firefight" } as const;
    for (const [kind, work] of Object.entries(kinds)) {
      const bot = makeRobot(g, kind, 0, x0 + 2, y0 + 2);
      expect(workPriority(bot, work)).toBeGreaterThan(0);
      expect(workPriority(bot, "cook")).toBe(0);
      expect(workPriority(bot, "research")).toBe(0);
    }
  });

  it("a guard robot drafts itself against a raider and stands down after", () => {
    const { g, x0, y0 } = setup("guard");
    const bot = makeRobot(g, "guard_bot", 0, x0 + 2, y0 + 2);
    g.pawns.set(bot.id, bot);
    const gid = g.newId();
    g.groups.set(gid, { id: gid, kind: "raid", size: 1, fleeing: false, arrived: g.tick });
    const raider = makeHostile(g, "human", "raiders", 0, x0 + 8, y0 + 2, gid, "pipe");
    g.pawns.set(raider.id, raider);
    run(g, 0.5);
    expect(bot.guarding || raider.health.downed || !g.pawns.has(raider.id)).toBe(true);
    run(g, 6);
    expect(raider.health.downed || !g.pawns.has(raider.id)).toBe(true);
    run(g, 0.5);
    expect(bot.drafted).toBe(false);
  });

  it("raiders can hack a robot; the hack wears off", () => {
    const { g, x0, y0 } = setup("hack");
    const bot = makeRobot(g, "builder_bot", 0, x0 + 2, y0 + 2);
    g.pawns.set(bot.id, bot);
    const gid = g.newId();
    g.groups.set(gid, { id: gid, kind: "raid", size: 1, fleeing: false, arrived: g.tick });
    expect(hackRobot(g, gid)?.id).toBe(bot.id);
    expect(bot.faction).toBe("raiders");
    expect(g.messages.some((m) => m.key === "msg.robot_hacked")).toBe(true);
    run(g, 13);
    expect(g.pawns.has(bot.id)).toBe(true);
    expect(bot.faction).toBe("colony");
    expect(bot.hackedAt).toBeUndefined();
  });
});
