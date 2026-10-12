import { describe, expect, it } from "vitest";
import { loadCoreContent } from "@wc/data";
import { createZone, designate, Game, loadGame, orderMove, placeBlueprint, saveGame, setResearch, skipTutorialStep, TUTORIAL_STEPS, tutorialFlag, type TutorialStepId } from "../src/index.ts";

const content = loadCoreContent();
const make = (seed = "any") => Game.create(content, { seed, mapSize: 200, storyteller: "chaos", scenario: "tutorial" });
const colony = (g: Game) => [...g.pawns.values()].filter((p) => p.faction === "colony");
const stepId = (g: Game) => TUTORIAL_STEPS[g.tutorial!.step];

/** A text fingerprint of the map and the survivors. */
function fingerprint(g: Game): string {
  const L = g.map.layers[0];
  const things = [...g.things.values()].map((t) => `${g.reg.things.list[t.def].id}@${t.x},${t.y}`).sort();
  const pawns = colony(g).map((p) => `${p.first} ${p.nick} ${p.x},${p.y} ${p.skills.map((s) => s.level).join("")}`);
  return [g.map.w, g.map.layers.length, Array.from(L.terrain).join(""), things.join(";"), pawns.join(";")].join("|");
}

/** Step the game until the tutorial reaches `id` (or fail after `days`). */
function runTo(g: Game, id: TutorialStepId, days = 2) {
  const max = g.ticksPerDay * days;
  const t0 = g.tick;
  for (let i = 0; i < max && stepId(g) !== id; i++) g.step();
  if (process.env.TUT_LOG) process.stderr.write(`${id}: ${((g.tick - t0) / g.ticksPerHour).toFixed(1)} h\n`);
  expect(stepId(g)).toBe(id);
}

describe("tutorial scenario", () => {
  it("is the same small map every time, whatever the options say", () => {
    const a = make("one"), b = make("two");
    expect(a.map.w).toBe(64);
    expect(a.map.layers.length).toBe(1);
    expect(a.opts.storyteller).toBe("none");
    expect(fingerprint(a)).toBe(fingerprint(b));
    expect(colony(a).map((p) => p.first)).toEqual(["Mara", "Jonas", "Ivy"]);
  });

  it("plays through every step, with the same raid every time", () => {
    const g = make();
    expect(stepId(g)).toBe("camera");
    tutorialFlag(g, "camera");
    runTo(g, "time");
    tutorialFlag(g, "pause");
    runTo(g, "select");
    tutorialFlag(g, "select");
    runTo(g, "stockpile");
    const pile = [];
    for (let y = 36; y <= 40; y++) for (let x = 26; x <= 30; x++) pile.push({ x, y });
    createZone(g, "stockpile", 0, pile);
    runTo(g, "cut");
    for (const t of [...g.things.values()].filter((t) => g.reg.things.list[t.def].id === "dead_tree").slice(0, 8)) designate(g, "cut", 0, t.x, t.y);
    runTo(g, "room");
    // A 5 x 5 hut with a door on the south side.
    for (let y = 20; y <= 24; y++)
      for (let x = 25; x <= 29; x++) {
        if (x !== 25 && x !== 29 && y !== 20 && y !== 24) continue;
        placeBlueprint(g, "thing", x === 27 && y === 24 ? "scrap_door" : "wood_wall", 0, x, y);
      }
    runTo(g, "bed", 3);
    placeBlueprint(g, "thing", "bedroll", 0, 26, 21);
    runTo(g, "grow");
    const field = [];
    for (let y = 26; y <= 33; y++) for (let x = 14; x <= 21; x++) field.push({ x, y });
    createZone(g, "grow", 0, field, [], "scrub_potato_plant");
    runTo(g, "work");
    tutorialFlag(g, "work");
    runTo(g, "cook");
    placeBlueprint(g, "thing", "campfire", 0, 33, 37);
    runTo(g, "research", 2);
    placeBlueprint(g, "thing", "research_desk", 0, 35, 25);
    expect(setResearch(g, "field_medicine")).toBe(true);
    runTo(g, "draft", 2);
    const p = colony(g)[0];
    orderMove(g, p, { layer: 0, x: p.x + 3, y: p.y });
    runTo(g, "raid");
    const raiders = [...g.pawns.values()].filter((q) => q.faction === "raiders");
    expect(raiders.map((q) => `${q.x},${q.y}`)).toEqual(["62,29", "62,31"]);
    for (const c of colony(g)) c.drafted = true;
    runTo(g, "done", 2);
    expect(g.opts.idleWork).toBe(true);
    expect(colony(g).length).toBe(3);
  });

  it("keeps its step in a save, and a step can be skipped", () => {
    const g = make();
    skipTutorialStep(g);
    skipTutorialStep(g);
    const back = loadGame(content, JSON.parse(JSON.stringify(saveGame(g))));
    expect(back.tutorial?.step).toBe(2);
    expect(back.map.w).toBe(64);
  });
});
