import { describe, expect, it } from "vitest";
import { applyMods, ITEMS, loadCoreContent, t } from "@wc/data";
import bakery from "../../../mods/wasteland-bakery.json";
import { Game } from "../src/index.ts";

const core = loadCoreContent();

describe("mods (B7)", () => {
  it("the example pack adds an item, a recipe, strings and art, and a game starts with it", () => {
    const r = applyMods(core, [bakery]);
    expect(r.errors).toEqual({});
    expect(r.loaded).toEqual(["wasteland-bakery"]);
    expect(r.content.items.some((i) => i.id === "flatbread")).toBe(true);
    expect(r.content.recipes.some((x) => x.id === "bake_flatbread")).toBe(true);
    expect(t("item.flatbread")).toBe("Flatbread");
    expect(ITEMS.flatbread).toHaveLength(16);
    const g = Game.create(r.content, { seed: "mod", mapSize: 64, storyteller: "none" });
    expect(g.reg.items.has("flatbread")).toBe(true);
  });

  it("an entry with a known id replaces the old one", () => {
    const r = applyMods(core, [{ id: "cheap-walls", name: "Cheap walls", recipes: [{ ...core.recipes[0], work: 1 }] }]);
    expect(r.content.recipes[0].work).toBe(1);
    expect(r.content.recipes.length).toBe(core.recipes.length);
  });

  it("a bad pack is left out with readable errors; good packs still load", () => {
    const bad = { id: "bad", name: "Bad", recipes: [{ id: "x", benches: ["campfire"], inputs: [{ item: "unobtainium", count: 1 }], output: { steel: 1 }, work: 10, skill: "cooking", target: 1 }] };
    const broken = { id: "broken", name: "Broken", items: [{ id: "no_fields" }] };
    const r = applyMods(core, [bad, broken, bakery]);
    expect(r.loaded).toEqual(["wasteland-bakery"]);
    expect(r.errors.bad[0]).toContain("unobtainium");
    expect(r.errors.broken[0]).toMatch(/^items\.no_fields\./);
  });
});
