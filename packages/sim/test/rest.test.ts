import { describe, expect, it } from "vitest";
import { loadCoreContent } from "@wc/data";
import { designate, dropItems, Game, inBed, NO_THING, pain, untendedInjuries, workOrder, workPriority, WORK_TYPES } from "../src/index.ts";

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
      p.work = Object.fromEntries(WORK_TYPES.map((w) => [w, (w === "doctor" && p !== patient) || (w === "patient" && p === patient) ? 1 : 0]));
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

describe("work priorities decide every choice", () => {
  it("order: best number first, then the columns (firefight, doctor, patient, warden, ... haul)", () => {
    const g = Game.create(content, { seed: "order", mapSize: 96, storyteller: "none" });
    const [p] = [...g.pawns.values()].filter((q) => q.faction === "colony");
    delete p.noWork;
    p.work = Object.fromEntries(WORK_TYPES.map((w) => [w, 3]));
    p.work.haul = 1;
    p.work.salvage = 1;
    expect(workOrder(p).slice(0, 5)).toEqual(["salvage", "haul", "firefight", "doctor", "patient"]);
  });

  it("a doctor drops salvage at once when a friend needs tending (same priority, doctor column first)", () => {
    const g = Game.create(content, { seed: "preempt", mapSize: 96, storyteller: "none" });
    const { x, y } = g.home;
    const L = g.map.layers[0];
    for (let ty = y - 6; ty <= y + 6; ty++)
      for (let tx = x - 6; tx <= x + 12; tx++) {
        const t = L.thing[L.i(tx, ty)];
        if (t !== NO_THING) g.removeThing(t);
        g.setTerrain(0, tx, ty, "dirt");
      }
    const [doc, hurt] = [...g.pawns.values()].filter((q) => q.faction === "colony");
    for (const q of g.pawns.values()) {
      delete q.noWork;
      q.work = Object.fromEntries(WORK_TYPES.map((w) => [w, 0]));
    }
    doc.work = { ...doc.work, salvage: 1, doctor: 1 };
    for (let k = 0; k < 6; k++) {
      g.spawnThing("car_wreck", 0, x + 6 + k, y + 4);
      designate(g, "salvage", 0, x + 6 + k, y + 4);
    }
    run(g, 0.3);
    expect(doc.job?.workType).toBe("salvage");
    hurt.health.injuries.push({ part: "l_arm", kind: "cut", dmg: 6, tended: 0 });
    // The doctor checks for more important work every few seconds, so this happens within minutes.
    let switched = false;
    for (let i = 0; i < 150 && !switched; i++) {
      g.step();
      switched = doc.job?.kind === "tend" || untendedInjuries(hurt).length === 0;
    }
    expect(switched).toBe(true);
  });
});
