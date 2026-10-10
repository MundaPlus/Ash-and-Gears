import { describe, expect, it } from "vitest";
import { loadCoreContent } from "@wc/data";
import { dropItems, Game, inBed, NO_THING, pain, untendedInjuries, workPriority, WORK_TYPES } from "../src/index.ts";

const content = loadCoreContent();
const run = (g: Game, hours: number) => {
  for (let i = 0, n = Math.round(hours * g.ticksPerHour); i < n; i++) g.step();
};

describe("bed rest for the badly hurt", () => {
  it("a badly hurt survivor goes to bed, and a doctor tends the wounds there", () => {
    const g = Game.create(content, { seed: "bedrest", mapSize: 96, storyteller: "none" });
    const { x, y } = g.home;
    const L = g.map.layers[0];
    for (let ty = y - 4; ty <= y + 4; ty++)
      for (let tx = x - 4; tx <= x + 4; tx++) {
        const t = L.thing[L.i(tx, ty)];
        if (t !== NO_THING) g.removeThing(t);
        g.setTerrain(0, tx, ty, "dirt");
      }
    g.spawnThing("scrap_bed", 0, x + 3, y - 3);
    dropItems(g, "bandage", 5, 0, x - 2, y + 2);
    const colony = [...g.pawns.values()].filter((p) => p.faction === "colony");
    const patient = colony[0];
    // Everyone else may doctor (some backstories cannot).
    for (const p of colony) {
      p.work = Object.fromEntries(WORK_TYPES.map((w) => [w, w === "doctor" && p !== patient ? 1 : 0]));
      delete p.noWork;
    }
    // Hurt but still standing: big cuts on the arms and a leg.
    for (const [part, dmg] of [["torso", 26], ["l_leg", 18], ["r_leg", 16], ["l_arm", 14]] as const) patient.health.injuries.push({ part, kind: "cut", dmg, tended: 0 });
    expect(pain(g, patient)).toBeGreaterThan(0.4);
    expect(colony.slice(1).some((d) => workPriority(d, "doctor") > 0)).toBe(true);
    let rested = false;
    for (let h = 0; h < 6 && !rested; h++) {
      run(g, 1);
      rested = inBed(g, patient);
    }
    expect(rested).toBe(true);
    run(g, 3);
    expect(untendedInjuries(patient).length).toBe(0);
  });
});
