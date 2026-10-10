import { describe, expect, it } from "vitest";
import { loadCoreContent } from "@wc/data";
import { Game } from "../src/index.ts";

const content = loadCoreContent();
const make = (scenario: string) => Game.create(content, { seed: `scen-${scenario}`, mapSize: 96, storyteller: "none", scenario });
const colony = (g: Game) => [...g.pawns.values()].filter((p) => p.faction === "colony");

describe("scenarios (B5)", () => {
  it("lone wanderer starts with one survivor", () => {
    expect(colony(make("lone")).length).toBe(1);
  });
  it("mall rats starts in a store with crates, and rats arrive", () => {
    const g = make("mall");
    expect([...g.things.values()].filter((t) => g.reg.things.list[t.def].id === "loot_crate").length).toBeGreaterThanOrEqual(8);
    expect([...g.pawns.values()].some((p) => p.faction === "wild")).toBe(true);
  });
  it("the bunker starts underground under a radiation cloud", () => {
    const g = make("bunker");
    expect(colony(g).every((p) => p.layer === 1)).toBe(true);
    expect(g.weather.kind).toBe("rad_cloud");
  });
  it("rad season raises cloud frequency", () => {
    expect(make("rad_season").opts.radCloudScale).toBeGreaterThanOrEqual(3);
  });
});
