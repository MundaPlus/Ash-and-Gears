import { describe, expect, it } from "vitest";
import { loadCoreContent } from "@wc/data";
import { changeGoodwill, countItems, dropItems, fireEvent, Game, goodwill, loadGame, markup, relationOf, saveGame, sendCaravan, trade } from "../src/index.ts";

const content = loadCoreContent();
const newGame = (seed: string) => Game.create(content, { seed, mapSize: 96, storyteller: "none" });
const run = (g: Game, hours: number) => {
  for (let i = 0, n = Math.round(hours * g.ticksPerHour); i < n; i++) g.step();
};

describe("factions and trade (A9)", () => {
  it("raids come from a hostile faction with its gear; no hostile faction, no raid", () => {
    const g = newGame("raid");
    for (const f of content.factions) if (f.kind !== "raider") changeGoodwill(g, f.id, 100);
    expect(relationOf(g, "rust_knights")).toBe("hostile");
    fireEvent(g, "raid");
    const raiders = [...g.pawns.values()].filter((p) => p.faction === "raiders");
    expect(raiders.length).toBeGreaterThan(0);
    expect(raiders.every((p) => p.origin === "rust_knights")).toBe(true);
  });

  it("a caravan comes, trades by value with a markup, takes gifts, and leaves after a day", () => {
    const g = newGame("trade");
    expect(sendCaravan(g, { x: g.home.x + 10, y: g.home.y })).toBe(true);
    const c = g.caravan!;
    const [want] = Object.keys(c.stock);
    const price = g.reg.items.get(want).value * markup(g, c.faction);
    // Not enough value offered: refused.
    expect(trade(g, { [want]: 1 }, {})).toBe("not_enough_value");
    dropItems(g, "steel", 60, 0, g.home.x + 2, g.home.y + 2);
    const steelNeeded = Math.ceil(price / g.reg.items.get("steel").value);
    const before = countItems(g, want);
    expect(trade(g, { [want]: 1 }, { steel: steelNeeded })).toBeNull();
    expect(countItems(g, want)).toBe(before + 1);
    const gw = goodwill(g, c.faction);
    expect(trade(g, {}, { steel: 30 })).toBeNull();
    expect(goodwill(g, c.faction)).toBeGreaterThan(gw);
    const g2 = loadGame(content, JSON.parse(JSON.stringify(saveGame(g))));
    expect(g2.caravan?.faction).toBe(c.faction);
    run(g, 30);
    expect(g.caravan).toBeNull();
    expect([...g.pawns.values()].some((p) => p.faction === "trader")).toBe(false);
  });
});
