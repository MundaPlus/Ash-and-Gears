import { describe, expect, it } from "vitest";
import { loadCoreContent } from "@wc/data";
import { armorReduction, countItems, damage, designate, dropItems, Game, loadGame, NO_THING, saveGame, WORK_TYPES, type Pawn } from "../src/index.ts";

const content = loadCoreContent();
const newGame = (seed: string) => Game.create(content, { seed, mapSize: 96, storyteller: "none" });
const run = (g: Game, hours: number) => {
  for (let i = 0, n = Math.round(hours * g.ticksPerHour); i < n; i++) g.step();
};
const colony = (g: Game) => [...g.pawns.values()].filter((p) => p.faction === "colony" && !p.robot);
const idx = (g: Game, id: string) => g.reg.items.idx(id);

function clearArea(g: Game, cx: number, cy: number, r: number) {
  const L = g.map.layers[0];
  for (let y = cy - r; y <= cy + r; y++)
    for (let x = cx - r; x <= cx + r; x++) {
      const t = L.thing[L.i(x, y)];
      if (t !== NO_THING) g.removeThing(t);
      g.setTerrain(0, x, y, "dirt");
    }
}

describe("weapon and armor tiers (N2)", () => {
  it("armor stops a share of each hit, by part and damage kind", () => {
    const g = newGame("armor");
    const [p] = colony(g);
    p.armor = [idx(g, "plate_vest"), idx(g, "plate_helmet")];
    expect(armorReduction(g, p, "torso", "gunshot")).toBeCloseTo(0.35);
    expect(armorReduction(g, p, "head", "cut")).toBeCloseTo(0.45);
    // A vest covers the legs only half; starvation goes through armor.
    expect(armorReduction(g, p, "l_leg", "gunshot")).toBeCloseTo(0.175);
    expect(armorReduction(g, p, "torso", "starvation")).toBe(0);
    // Same blows, with and without armor.
    const hits = (q: Pawn) => {
      q.health.injuries = [];
      for (let i = 0; i < 40; i++) damage(g, q, 1, "cut", "torso");
      return q.health.injuries.reduce((s, i) => s + i.dmg, 0);
    };
    const armored = hits(p);
    p.armor = [];
    expect(armored).toBeLessThan(hits(p) * 0.7);
  });

  it("survivors swap to a clearly better weapon and put on armor from storage", () => {
    const g = newGame("equip");
    const ps = colony(g);
    for (const p of ps) {
      p.weapon = idx(g, "pipe");
      p.work = Object.fromEntries(WORK_TYPES.map((w) => [w, 0]));
    }
    const { x, y } = g.home;
    clearArea(g, x + 4, y + 4, 2);
    dropItems(g, "hunting_rifle", 1, 0, x + 3, y + 3);
    dropItems(g, "scrap_vest", 1, 0, x + 5, y + 3);
    dropItems(g, "plate_helmet", 1, 0, x + 4, y + 5);
    run(g, 4);
    expect(ps.some((p) => p.weapon === idx(g, "hunting_rifle"))).toBe(true);
    expect(ps.some((p) => p.armor.includes(idx(g, "scrap_vest")))).toBe(true);
    expect(ps.some((p) => p.armor.includes(idx(g, "plate_helmet")))).toBe(true);
    // The old pipe lies on the floor again.
    expect(countItems(g, "pipe")).toBeGreaterThanOrEqual(1);
  });

  it("worn armor survives save and load", () => {
    const g = newGame("armorsave");
    const [p] = colony(g);
    p.armor = [idx(g, "combat_armor")];
    const back = loadGame(content, JSON.parse(JSON.stringify(saveGame(g))));
    expect(back.pawns.get(p.id)!.armor).toEqual([back.reg.items.idx("combat_armor")]);
  });

  it("each weapon and armor tier needs its research", () => {
    const need = (item: string) => content.recipes.find((r) => r.output[item])?.research ?? null;
    expect(need("crossbow")).toBeNull();
    expect(need("scrap_shotgun")).toBe("gunsmithing");
    expect(need("hunting_rifle")).toBe("rifling");
    expect(need("assault_rifle")).toBe("advanced_weapons");
    expect(need("energy_rifle")).toBe("energy_weapons");
    expect(need("rag_armor")).toBeNull();
    expect(need("plate_helmet")).toBe("plate_armor");
    expect(need("power_armor")).toBe("power_armor");
  });
});

describe("water at the well comes first within hauling", () => {
  it("a hauler fills the well's jugs before other hauling, even with salvage all around", () => {
    const g = newGame("busywell");
    const { x: hx, y: hy } = g.home;
    clearArea(g, hx - 6, hy - 6, 2);
    g.spawnThing("well", 0, hx - 6, hy - 6);
    for (const s of [...g.items.values()]) if (g.reg.items.list[s.def].id === "clean_water") s.count = 1;
    // Lots of salvage (it comes before hauling in the work order) all around.
    clearArea(g, hx + 8, hy, 5);
    for (let dx = -4; dx <= 4; dx += 2)
      for (let dy = -4; dy <= 4; dy += 2) {
        g.spawnThing("scrap_pile", 0, hx + 8 + dx, hy + dy);
        designate(g, "salvage", 0, hx + 8 + dx, hy + dy);
      }
    // The player's say: one survivor hauls first (priority 1). The rest salvage.
    const [hauler] = colony(g);
    hauler.work = { ...hauler.work, haul: 1 };
    delete hauler.noWork;
    run(g, 6);
    expect(countItems(g, "clean_water")).toBeGreaterThanOrEqual(5);
  });
});
