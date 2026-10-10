import { describe, expect, it } from "vitest";
import { loadCoreContent } from "@wc/data";
import en from "../../data/i18n/en.json";

const c = loadCoreContent();
const has = (k: string) => k in (en as Record<string, string>);

describe("content text", () => {
  it("every research, thing, recipe and item has its player text; every manual says where to find it", () => {
    const missing = [
      ...c.research.flatMap((r) => [`research.${r.id}`, `research.${r.id}.desc`]),
      ...c.things.filter((t) => t.build).map((t) => `thing.${t.id}`),
      ...c.recipes.map((r) => `recipe.${r.id}`),
      ...c.items.map((i) => `item.${i.id}`),
      ...c.research.filter((r) => r.blueprint).map((r) => `where.${r.blueprint}`),
    ].filter((k) => !has(k));
    expect(missing).toEqual([]);
  });

  it("the research tree has no unknown prerequisites and no loops", () => {
    const ids = new Set(c.research.map((r) => r.id));
    for (const r of c.research) for (const p of r.prereqs) expect(ids.has(p)).toBe(true);
    const byId = new Map(c.research.map((r) => [r.id, r]));
    const depth = (id: string, seen: Set<string>): number => {
      expect(seen.has(id)).toBe(false);
      const r = byId.get(id)!;
      return 1 + Math.max(0, ...r.prereqs.map((p) => depth(p, new Set([...seen, id]))));
    };
    for (const r of c.research) depth(r.id, new Set());
  });
});
