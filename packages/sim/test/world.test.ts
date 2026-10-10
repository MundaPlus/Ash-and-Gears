import { describe, expect, it } from "vitest";
import { loadCoreContent } from "@wc/data";
import { canLaunch, countItems, dropItems, ensureWorld, Game, launchExpedition, loadGame, saveGame, travelHours, WORK_TYPES } from "../src/index.ts";

const content = loadCoreContent();
const newGame = (seed: string) => Game.create(content, { seed, mapSize: 96, storyteller: "none" });
const run = (g: Game, hours: number) => {
  for (let i = 0, n = Math.round(hours * g.ticksPerHour); i < n; i++) g.step();
};
const colonists = (g: Game) => [...g.pawns.values()].filter((p) => p.faction === "colony");
const nearest = (g: Game) => {
  const w = ensureWorld(g);
  return [...w.sites].sort((a, b) => travelHours(g, a) - travelHours(g, b))[0];
};

describe("world map and expeditions (A8)", () => {
  it("makes the same world from the same seed, and saves it", () => {
    const a = ensureWorld(newGame("world"));
    const b = ensureWorld(newGame("world"));
    expect(a.sites.length).toBe(14);
    expect(b.sites.map((s) => [s.x, s.y, s.kind])).toEqual(a.sites.map((s) => [s.x, s.y, s.kind]));
    const g = newGame("world");
    ensureWorld(g);
    const g2 = loadGame(content, JSON.parse(JSON.stringify(saveGame(g))));
    expect(g2.world!.sites.length).toBe(14);
  });

  it("a team travels, scavenges and comes back with loot", () => {
    const g = newGame("trip");
    for (const p of colonists(g)) p.work = Object.fromEntries(WORK_TYPES.map((w) => [w, 0]));
    const site = nearest(g);
    site.danger = 0;
    const [p] = colonists(g);
    const scrap0 = countItems(g, "scrap") + countItems(g, "steel") + countItems(g, "components") + countItems(g, "cloth") + countItems(g, "canned_food");
    const exp = launchExpedition(g, site.id, [p.id]);
    expect(exp).not.toBeNull();
    expect(g.pawns.has(p.id)).toBe(false);
    // Saved mid-trip, the team is still on the road after loading.
    const mid = loadGame(content, JSON.parse(JSON.stringify(saveGame(g))));
    expect(mid.expeditions[0].pawns[0].id).toBe(p.id);
    run(g, travelHours(g, site) * 2 + 14);
    expect(g.expeditions.length).toBe(0);
    expect(g.pawns.has(p.id)).toBe(true);
    const after = countItems(g, "scrap") + countItems(g, "steel") + countItems(g, "components") + countItems(g, "cloth") + countItems(g, "canned_food");
    expect(after).toBeGreaterThan(scrap0 - 10);
    expect(Object.keys(exp!.loot).length).toBeGreaterThan(0);
  });

  it("no food, no trip; an outpost gathers and the next team brings it home", () => {
    const g = newGame("outpost");
    const site = nearest(g);
    site.danger = 0;
    const [p, q] = colonists(g);
    for (const s of [...g.items.values()]) if (g.reg.items.list[s.def].category === "food") g.items.delete(s.id);
    const L = g.map.layers[0];
    for (let i = 0; i < L.item.length; i++) if (L.item[i] !== -1 && !g.items.has(L.item[i])) L.item[i] = -1;
    expect(canLaunch(g, site, [p], false)).toBe("no_food");
    dropItems(g, "simple_meal", 30, 0, g.home.x + 3, g.home.y - 3);
    dropItems(g, "wood", 30, 0, g.home.x + 4, g.home.y - 3);
    expect(launchExpedition(g, site.id, [p.id], true)).not.toBeNull();
    run(g, travelHours(g, site) + 1);
    expect(site.outpost).toBeDefined();
    run(g, travelHours(g, site) + 14 + 48);
    expect(Object.values(site.outpost!.stock).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    expect(launchExpedition(g, site.id, [q.id])).not.toBeNull();
    run(g, travelHours(g, site) + 1);
    expect(Object.values(site.outpost!.stock).reduce((a, b) => a + b, 0)).toBe(0);
  });
});
