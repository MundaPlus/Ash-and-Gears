import { describe, expect, it } from "vitest";
import { loadCoreContent } from "@wc/data";
import { Game, isSleepTime, NO_THING, scheduleOf, setSchedule, WORK_TYPES } from "../src/index.ts";

const content = loadCoreContent();
const run = (g: Game, hours: number) => {
  for (let i = 0, n = Math.round(hours * g.ticksPerHour); i < n; i++) g.step();
};

function setup(seed: string) {
  const g = Game.create(content, { seed, mapSize: 96, storyteller: "none" });
  const x0 = g.home.x - 6, y0 = g.home.y - 10;
  const L = g.map.layers[0];
  for (let y = y0 - 1; y <= y0 + 6; y++)
    for (let x = x0 - 1; x <= x0 + 10; x++) {
      const t = L.thing[L.i(x, y)];
      if (t !== NO_THING) g.removeThing(t);
      g.setTerrain(0, x, y, "dirt");
    }
  const pawns = [...g.pawns.values()].filter((p) => p.faction === "colony");
  for (const p of pawns) p.work = Object.fromEntries(WORK_TYPES.map((w) => [w, 0]));
  return { g, x0, y0, pawns };
}

describe("recreation and schedules (B9)", () => {
  it("a bored survivor relaxes at a card table and gets fun back", () => {
    const { g, x0, y0, pawns } = setup("fun");
    const table = g.spawnThing("card_table", 0, x0 + 4, y0 + 2);
    const [p] = pawns;
    p.needs.fun = 0.1;
    for (const q of pawns) setSchedule(g, q, Math.floor(g.hourOfDay), "any");
    run(g, 0.5);
    expect(p.job?.kind).toBe("relax");
    expect(p.job?.targetId).toBe(table.id);
    run(g, 1.5);
    expect(p.needs.fun).toBeGreaterThan(0.4);
  });

  it("fun drops while awake and low fun makes survivors bored", () => {
    const { g, pawns } = setup("bored");
    const [p] = pawns;
    p.needs.fun = 0.2;
    run(g, 0.2);
    expect(p.situational.map((i) => g.reg.thoughts.list[i].id)).toContain("bored");
  });

  it("the schedule decides sleep hours; joy hours send survivors to relax", () => {
    const { g, pawns } = setup("sched");
    const [p] = pawns;
    expect(scheduleOf(g, p)[23]).toBe("sleep");
    expect(scheduleOf(g, p)[12]).toBe("any");
    const h = Math.floor(g.hourOfDay);
    setSchedule(g, p, h, "sleep");
    expect(isSleepTime(g, p)).toBe(true);
    for (let k = 0; k < 3; k++) setSchedule(g, p, h + k, "joy");
    p.needs.fun = 0.7;
    p.needs.rest = 1;
    run(g, 0.3);
    expect(p.job?.kind).toBe("relax");
  });
});
