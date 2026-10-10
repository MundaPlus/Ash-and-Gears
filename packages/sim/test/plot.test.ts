import { describe, expect, it } from "vitest";
import { loadCoreContent } from "@wc/data";
import { currentBeat, dropItems, endingSlides, ensureWorld, Game, kill, visitStorySite } from "../src/index.ts";

const content = loadCoreContent();
const hours = (g: Game, h: number) => {
  for (let i = 0, n = Math.round(h * g.ticksPerHour); i < n; i++) g.step();
};
/** Remove raiders so "calm" can be reached in a test. */
const calm = (g: Game) => {
  for (const p of [...g.pawns.values()]) if (p.faction === "raiders") g.pawns.delete(p.id);
  g.groups.clear();
};

describe("storylines (B1)", () => {
  it("the reactor story runs from the badge to the win", () => {
    const g = Game.create(content, { seed: "plot", mapSize: 96, storyteller: "none", storyline: "reactor" });
    expect([...g.pawns.values()].some((p) => p.nick === "HAL-PH" && p.robot)).toBe(true);
    expect(ensureWorld(g).sites.some((s) => s.storyKey === "plant")).toBe(true);
    expect(currentBeat(g)?.id).toBe("badge");
    visitStorySite(g, "plant");
    hours(g, 1);
    expect(currentBeat(g)?.id).toBe("parts");
    dropItems(g, "reactor_part", 3, 0, g.home.x + 3, g.home.y + 3);
    hours(g, 1);
    expect(currentBeat(g)?.id).toBe("console");
    calm(g);
    g.research.done.add("reactor_control");
    g.spawnThing("reactor_console", 0, g.home.x - 12, g.home.y - 12);
    hours(g, 1);
    expect(currentBeat(g)?.id).toBe("restart");
    dropItems(g, "reactor_spark", 1, 0, g.home.x + 4, g.home.y + 3);
    hours(g, 1);
    expect(currentBeat(g)?.id).toBe("hold");
    calm(g);
    hours(g, 49);
    calm(g);
    hours(g, 1);
    expect(g.plot.won).toBe("reactor");
    expect(endingSlides(g).length).toBeGreaterThanOrEqual(3);
  });

  it("with everyone dead the story is lost", () => {
    const g = Game.create(content, { seed: "lost", mapSize: 96, storyteller: "none", storyline: "bus" });
    for (const p of [...g.pawns.values()]) if (p.faction === "colony") kill(g, p, "test");
    hours(g, 1);
    expect(g.plot.lost).toBe(true);
  });

  it("the bus and orbit stories start with their first goals", () => {
    const bus = Game.create(content, { seed: "bus", mapSize: 96, storyteller: "none", storyline: "bus" });
    expect(ensureWorld(bus).sites.some((s) => s.storyKey === "depot")).toBe(true);
    const orbit = Game.create(content, { seed: "orbit", mapSize: 96, storyteller: "none", storyline: "orbit" });
    expect(currentBeat(orbit)?.id).toBe("voices");
    orbit.research.done.add("radio_tech");
    hours(orbit, 1);
    expect(ensureWorld(orbit).sites.filter((s) => s.storyKey?.startsWith("relay_")).length).toBe(3);
  });
});
