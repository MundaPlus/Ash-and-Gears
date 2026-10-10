import { describe, expect, it } from "vitest";
import { loadCoreContent } from "@wc/data";
import { computeAlerts, daysLeft, Game } from "../src/index.ts";

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
