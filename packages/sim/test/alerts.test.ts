import { describe, expect, it } from "vitest";
import { loadCoreContent } from "@wc/data";
import { computeAlerts, daysLeft, Game, makeHostile, setCapture } from "../src/index.ts";

const content = loadCoreContent();

describe("alerts", () => {
  it("a new colony is warned about missing beds, and food days are counted", () => {
    const g = Game.create(content, { seed: "alerts", mapSize: 96, storyteller: "none" });
    const keys = computeAlerts(g).map((a) => a.key);
    expect(keys).toContain("alert.no_beds");
    expect(daysLeft(g).food).toBeGreaterThan(2);
    // Eat everything: food runs low.
    for (const s of [...g.items.values()]) if (g.reg.items.list[s.def].category === "food") g.items.delete(s.id);
    expect(computeAlerts(g).find((a) => a.key === "alert.food_low")?.level).toBe("bad");
  });
});

describe("prison alert", () => {
  it("warns when a raider is marked for capture but no prisoner bed is free", () => {
    const g = Game.create(content, { seed: "prison-alert", mapSize: 96, storyteller: "none" });
    const gid = g.newId();
    g.groups.set(gid, { id: gid, kind: "raid", size: 1, fleeing: false, arrived: g.tick });
    const r = makeHostile(g, "human", "raiders", 0, g.home.x + 3, g.home.y, gid, null);
    r.health.downed = true;
    g.pawns.set(r.id, r);
    setCapture(g, r, true);
    expect(computeAlerts(g).some((a) => a.key === "alert.no_prison_bed")).toBe(true);
  });
});
