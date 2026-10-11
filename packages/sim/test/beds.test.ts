import { describe, expect, it } from "vitest";
import { loadCoreContent } from "@wc/data";
import { bedAt, bedUse, Game, inBed, NO_THING, setBedUse, WORK_TYPES } from "../src/index.ts";

const content = loadCoreContent();
const run = (g: Game, hours: number) => {
  for (let i = 0, n = Math.round(hours * g.ticksPerHour); i < n; i++) g.step();
};

function camp(seed: string) {
  const g = Game.create(content, { seed, mapSize: 96, storyteller: "none" });
  const { x, y } = g.home;
  const L = g.map.layers[0];
  for (let ty = y - 5; ty <= y + 5; ty++)
    for (let tx = x - 5; tx <= x + 5; tx++) {
      const t = L.thing[L.i(tx, ty)];
      if (t !== NO_THING) g.removeThing(t);
      g.setTerrain(0, tx, ty, "dirt");
    }
  const own = g.spawnThing("scrap_bed", 0, x - 4, y - 4);
  const med = g.spawnThing("scrap_bed", 0, x + 3, y - 4);
  const colony = [...g.pawns.values()].filter((p) => p.faction === "colony");
  return { g, own, med, colony };
}

describe("bed uses: colonists, prisoners, medical", () => {
  it("nobody claims a medical bed to sleep; marking a bed medical frees its owner", () => {
    const { g, own, med, colony } = camp("beds1");
    colony[0].bedId = med.id;
    setBedUse(g, med, "medical");
    expect(bedUse(med)).toBe("medical");
    expect(colony[0].bedId).toBe(null);
    for (const p of colony) p.needs.rest = 0.05;
    run(g, 3);
    expect(colony.some((p) => p.bedId === med.id)).toBe(false);
    expect(colony.some((p) => p.bedId === own.id)).toBe(true);
    setBedUse(g, med, "prisoner");
    expect(med.forPrisoners && !med.medical).toBe(true);
  });

  it("a badly hurt survivor rests in the medical bed, not their own", () => {
    const { g, own, med, colony } = camp("beds2");
    setBedUse(g, med, "medical");
    const patient = colony[0];
    patient.bedId = own.id;
    for (const p of colony) {
      p.work = Object.fromEntries(WORK_TYPES.map((w) => [w, w === "patient" && p === patient ? 1 : 0]));
      delete p.noWork;
    }
    for (const [part, dmg] of [["torso", 26], ["l_leg", 18], ["r_leg", 16], ["l_arm", 14]] as const) patient.health.injuries.push({ part, kind: "cut", dmg, tended: 0 });
    let rested = false;
    for (let h = 0; h < 6 && !rested; h++) {
      run(g, 1);
      rested = inBed(g, patient);
    }
    expect(rested).toBe(true);
    expect(bedAt(g, patient)?.id).toBe(med.id);
  });
});
