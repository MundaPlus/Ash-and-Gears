import { describe, expect, it } from "vitest";
import { loadCoreContent } from "@wc/data";
import { changeOpinion, Game, kill, loadGame, moveSpeed, opinion, relationLabel, saveGame, talk, workPriority } from "../src/index.ts";

const content = loadCoreContent();
const newGame = (seed: string) => Game.create(content, { seed, mapSize: 96, storyteller: "none" });
const run = (g: Game, hours: number) => {
  for (let i = 0, n = Math.round(hours * g.ticksPerHour); i < n; i++) g.step();
};
const colonists = (g: Game) => [...g.pawns.values()].filter((p) => p.faction === "colony");
const memo = (g: Game, p: ReturnType<typeof colonists>[number], id: string) => p.memories.some((m) => g.reg.thoughts.list[m.thought].id === id);

describe("survivors I (A5)", () => {
  it("survivors who spend days together talk and form opinions", () => {
    const g = newGame("talks");
    run(g, 48);
    const [a, b, c] = colonists(g);
    const all = [opinion(g, a, b), opinion(g, b, a), opinion(g, a, c), opinion(g, c, b)];
    expect(all.some((o) => o !== 0)).toBe(true);
  });

  it("good talks make friends, close friends can become lovers, and a death is mourned", () => {
    const g = newGame("friends");
    const [a, b, c] = colonists(g);
    a.age = b.age = 30;
    for (let i = 0; i < 60; i++) talk(g, a, b, 1);
    expect(["friend", "lover", "family"]).toContain(relationLabel(g, a, b));
    // Rivals: bad talks.
    for (let i = 0; i < 40; i++) talk(g, a, c, 0);
    expect(relationLabel(g, a, c)).toBe("rival");
    kill(g, b, "test");
    expect(memo(g, a, "lover_died") || memo(g, a, "friend_died") || memo(g, a, "family_died")).toBe(true);
  });

  it("backstories rule out work, traits change walking speed, and both survive a save", () => {
    const g = newGame("backstory");
    const [a, b] = colonists(g);
    a.noWork = ["haul"];
    expect(workPriority(a, "haul")).toBe(0);
    const before = moveSpeed(g, a);
    a.traits = [g.reg.traits.idx("fast_walker")];
    expect(moveSpeed(g, a)).toBeCloseTo(before * 1.2);
    changeOpinion(g, a, b, 33);
    const g2 = loadGame(content, JSON.parse(JSON.stringify(saveGame(g))));
    const a2 = g2.pawns.get(a.id)!, b2 = g2.pawns.get(b.id)!;
    expect(opinion(g2, a2, b2)).toBeCloseTo(opinion(g, a, b));
    expect(a2.backstory).toEqual(a.backstory);
    expect(a2.noWork).toEqual(["haul"]);
  });
});
