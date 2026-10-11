import { describe, expect, it } from "vitest";
import { loadCoreContent } from "@wc/data";
import {
  attackOf,
  bleedRate,
  computeAlerts,
  canSee,
  damage,
  dropItems,
  fireEvent,
  Game,
  hitChance,
  makeHostile,
  NO_THING,
  orderAttack,
  pain,
  setDrafted,
  startFire,
  untendedInjuries,
  WORK_TYPES,
  type Pawn,
} from "../src/index.ts";

const content = loadCoreContent();
const newGame = (seed: string, storyteller: "none" | "sheriff" = "none") => Game.create(content, { seed, mapSize: 96, storyteller, idleWork: false });
const run = (g: Game, hours: number) => {
  for (let i = 0, n = Math.round(hours * g.ticksPerHour); i < n; i++) g.step();
};
const colonists = (g: Game) => [...g.pawns.values()].filter((p) => p.faction === "colony");

function clearArea(g: Game, cx: number, cy: number, r: number) {
  const L = g.map.layers[0];
  for (let y = cy - r; y <= cy + r; y++)
    for (let x = cx - r; x <= cx + r; x++) {
      if (!L.inBounds(x, y)) continue;
      const t = L.thing[L.i(x, y)];
      if (t !== NO_THING) g.removeThing(t);
      g.setTerrain(0, x, y, "dirt");
    }
}

describe("health", () => {
  it("wounds bleed, tending slows bleeding, and they heal over days", () => {
    const g = newGame("health");
    const p = colonists(g)[0];
    damage(g, p, 12, "cut", "l_arm");
    const raw = bleedRate(p);
    expect(raw).toBeGreaterThan(0.02);
    for (const i of untendedInjuries(p)) i.tended = 0.6;
    expect(bleedRate(p)).toBeLessThan(raw / 2);
    dropItems(g, "canned_food", 40, 0, g.home.x - 3, g.home.y - 3);
    run(g, 24 * 6);
    expect(p.health.injuries.filter((i) => i.kind === "cut").length).toBe(0);
    expect(g.pawns.has(p.id)).toBe(true);
  });

  it("a destroyed head kills; a destroyed arm is lost", () => {
    const g = newGame("parts");
    const [a, b] = colonists(g);
    damage(g, a, 200, "blunt", "head");
    expect(g.pawns.has(a.id)).toBe(false);
    expect(g.deaths.at(-1)!.id).toBe(a.id);
    damage(g, b, 200, "cut", "r_arm");
    expect(b.health.missing).toContain("r_arm");
    expect(g.pawns.has(b.id)).toBe(true);
  });

  it("starving to death takes a few days once food runs out", () => {
    const g = Game.create(content, { seed: "starve2", mapSize: 96, dayLengthSec: 120, storyteller: "none", idleWork: false });
    for (const s of [...g.items.values()]) if (g.reg.items.list[s.def].category === "food") {
      const L = g.map.layers[s.layer];
      L.item[L.i(s.x, s.y)] = -1;
      g.items.delete(s.id);
    }
    dropItems(g, "clean_water", 75, 0, g.home.x + 2, g.home.y + 2);
    run(g, 24 * 1);
    expect(colonists(g).length).toBe(3);
    run(g, 24 * 7);
    expect(g.deaths.filter((d) => d.cause === "starvation").length).toBeGreaterThan(0);
  });
});

describe("combat rules", () => {
  it("a closed door blocks sight and shots; it is open while someone stands in it (user report)", () => {
    const g = newGame("losdoor");
    const { x, y } = g.home;
    clearArea(g, x, y - 12, 6);
    const a = { x: x - 5, y: y - 12 }, b = { x: x + 5, y: y - 12 };
    g.spawnThing("scrap_door", 0, x, y - 12);
    expect(canSee(g, 0, a, b)).toBe(false);
    const p = colonists(g)[0];
    p.layer = 0;
    p.x = x;
    p.y = y - 12;
    g.step();
    expect(canSee(g, 0, a, b)).toBe(true);
  });

  it("walls block sight; sandbags lower the hit chance", () => {
    const g = newGame("los");
    const { x, y } = g.home;
    clearArea(g, x, y - 12, 6);
    const a = { x: x - 5, y: y - 12 }, b = { x: x + 5, y: y - 12 };
    expect(canSee(g, 0, a, b)).toBe(true);
    g.spawnThing("scrap_wall", 0, x, y - 12);
    expect(canSee(g, 0, a, b)).toBe(false);
    g.removeThing(g.map.layers[0].thing[g.map.layers[0].i(x, y - 12)]);
    const target = makeHostile(g, "human", "raiders", 0, b.x, b.y, 0, "pipe");
    const shooter = colonists(g)[0];
    shooter.weapon = g.reg.items.idx("pipe_pistol");
    const open = hitChance(g, 6, attackOf(g, shooter), 0, a, target);
    g.spawnThing("sandbags", 0, b.x - 1, b.y);
    const covered = hitChance(g, 6, attackOf(g, shooter), 0, a, target);
    expect(covered).toBeLessThan(open - 0.2);
  });
});

describe("fights", () => {
  it("drafted survivors with pistols kill a rat swarm", () => {
    const g = newGame("rats");
    const { x, y } = g.home;
    clearArea(g, x, y, 10);
    const group = g.newId();
    g.groups.set(group, { id: group, kind: "rad_rats", size: 4, fleeing: false, arrived: 0 });
    for (let i = 0; i < 4; i++) {
      const r = makeHostile(g, "rad_rat", "wild", 0, x + 8, y - 3 + i * 2, group, null);
      g.pawns.set(r.id, r);
    }
    const rats = () => [...g.pawns.values()].filter((p) => p.group === group);
    for (const c of colonists(g)) {
      c.weapon = g.reg.items.idx("pipe_pistol");
      orderAttack(g, c, rats()[0]);
      c.order = null; // drafted, no single target: shoot whatever is in range
    }
    run(g, 3);
    expect(rats().filter((r) => !r.health.downed).length).toBe(0);
    expect(g.fx.length).toBeGreaterThan(0);
  });

  it("a raid arrives, fights, and ends (raiders dead, down or fled)", () => {
    const g = newGame("raid");
    const { x, y } = g.home;
    for (const c of colonists(g)) c.weapon = g.reg.items.idx("pipe_pistol");
    g.spawnThing("scrap_turret", 0, x + 2, y - 2);
    g.story.points = 6;
    fireEvent(g, "raid");
    const raiders = () => [...g.pawns.values()].filter((p) => p.faction === "raiders");
    const n0 = raiders().length;
    expect(n0).toBeGreaterThanOrEqual(2);
    const start = Math.min(...raiders().map((r) => Math.hypot(r.x - x, r.y - y)));
    run(g, 2);
    const mid = raiders().length ? Math.min(...raiders().map((r) => Math.hypot(r.x - x, r.y - y))) : 0;
    expect(mid).toBeLessThan(start);
    run(g, 24);
    expect([...g.groups.values()].filter((gr) => gr.kind !== "lair").length).toBe(0);
    expect(raiders().filter((r) => !r.health.downed).length).toBe(0);
  });

  it("a doctor carries a downed survivor to bed and tends the wounds", () => {
    const g = newGame("doctor");
    const { x, y } = g.home;
    clearArea(g, x - 6, y - 6, 2);
    g.spawnThing("scrap_bed", 0, x - 6, y - 6);
    dropItems(g, "bandage", 5, 0, x + 2, y - 2);
    const [patient] = colonists(g);
    damage(g, patient, 20, "gunshot", "l_leg");
    damage(g, patient, 20, "gunshot", "r_leg");
    patient.health.bloodLoss = 0.65;
    damage(g, patient, 1, "cut", "torso"); // re-check downed state
    expect(patient.health.downed).toBe(true);
    run(g, 6);
    expect([patient.x, patient.y]).toEqual([x - 6, y - 6]);
    expect(untendedInjuries(patient).length).toBe(0);
  });

  it("a doctor drops their job and rushes to a downed survivor", () => {
    const g = newGame("alarm");
    const { x, y } = g.home;
    clearArea(g, x - 6, y - 6, 2);
    g.spawnThing("scrap_bed", 0, x - 6, y - 6);
    const [patient, doctor, ...rest] = colonists(g);
    for (const o of rest) o.work.doctor = 0;
    // The doctor is busy with a long job (asleep on the ground) when the patient goes down.
    doctor.needs.rest = 0.05;
    doctor.job = { kind: "sleep", stage: 0, target: { layer: 0, x: doctor.x, y: doctor.y } };
    damage(g, patient, 20, "gunshot", "l_leg");
    damage(g, patient, 20, "gunshot", "r_leg");
    patient.health.bloodLoss = 0.65;
    damage(g, patient, 1, "cut", "torso");
    expect(patient.health.downed).toBe(true);
    for (let i = 0; i < 40; i++) g.step();
    expect(doctor.job?.kind).toBe("rescue");
  });
});

describe("fire", () => {
  it("spreads through dry plants and dies down without fuel", () => {
    const g = newGame("fire");
    const { x, y } = g.home;
    clearArea(g, x + 10, y + 10, 4);
    for (let i = 0; i < 6; i++) g.spawnThing("dead_tree", 0, x + 8 + i, y + 10);
    // Keep survivors away: firefighting only happens near home, and this is close, so pause them.
    for (const c of colonists(g)) c.work.firefight = 0;
    startFire(g, 0, x + 8, y + 10, 0.8);
    run(g, 6);
    const trees = [...g.things.values()].filter((t) => g.reg.things.list[t.def].id === "dead_tree" && t.y === y + 10 && t.x >= x + 8 && t.x < x + 14);
    expect(trees.length).toBeLessThan(6);
    run(g, 24);
    expect(g.fires.size).toBe(0);
  });

  it("firefighters put out a fire near home", () => {
    const g = newGame("firefight");
    const { x, y } = g.home;
    clearArea(g, x + 4, y + 4, 2);
    g.spawnThing("dead_tree", 0, x + 4, y + 4);
    startFire(g, 0, x + 4, y + 4, 0.3);
    run(g, 2);
    expect(g.fires.size).toBe(0);
    expect(g.thingDefAt(0, x + 4, y + 4)?.id).toBe("dead_tree");
  });
});

describe("storyteller", () => {
  it("is quiet for the first days, then brings threats", () => {
    const g = Game.create(content, { seed: "story", mapSize: 96, storyteller: "sheriff", dayLengthSec: 120 });
    run(g, 24 * 2.9);
    expect(g.story.log.filter((e) => ["raid", "rad_rats", "glow_hounds", "rad_cloud"].includes(e.event)).length).toBe(0);
    run(g, 24 * 15);
    expect(g.story.log.filter((e) => ["raid", "rad_rats", "glow_hounds", "rad_cloud"].includes(e.event)).length).toBeGreaterThan(1);
  });
});

void pain;
void ({} as Pawn);

describe("drafted needs and feeding the downed", () => {
  it("a drafted survivor with critical thirst and no enemy near takes a drink and stays drafted", () => {
    const g = Game.create(loadCoreContent(), { seed: "drafted-drink", mapSize: 96, storyteller: "none", idleWork: false });
    const p = [...g.pawns.values()].find((q) => q.faction === "colony")!;
    setDrafted(g, p, true);
    p.needs.thirst = 0.12;
    expect(computeAlerts(g).some((a) => a.key === "alert.drafted_needs")).toBe(true);
    for (let i = 0; i < g.ticksPerHour * 3; i++) g.step();
    expect(p.needs.thirst).toBeGreaterThan(0.3);
    expect(p.drafted).toBe(true);
  });

  it("a doctor brings water to a downed survivor even with no jugs and no clean well", () => {
    const g = Game.create(loadCoreContent(), { seed: "feed-downed", mapSize: 96, storyteller: "none", idleWork: false });
    for (const s of [...g.items.values()]) if (g.reg.items.list[s.def].category === "water") g.items.delete(s.id);
    const L = g.map.layers[0];
    for (let i = 0; i < L.item.length; i++) if (L.item[i] !== -1 && !g.items.has(L.item[i])) L.item[i] = -1;
    const [patient, doc] = [...g.pawns.values()].filter((q) => q.faction === "colony");
    for (const q of g.pawns.values()) q.work = Object.fromEntries(WORK_TYPES.map((w) => [w, w === "doctor" ? 1 : 0]));
    g.spawnThing("well", 0, g.home.x + 6, g.home.y + 6);
    patient.health.downed = true;
    patient.needs.thirst = 0.1;
    doc.needs.thirst = 1;
    for (let i = 0; i < g.ticksPerHour * 4; i++) g.step();
    expect(patient.needs.thirst).toBeGreaterThan(0.1);
  });
});
