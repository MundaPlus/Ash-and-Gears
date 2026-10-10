/**
 * Doctors (spec 01 "Health"): rescue downed survivors to a bed, tend wounds with bandages
 * (or bare hands). Also: survivors without a weapon pick one up.
 */
import { tapHasWater } from "./fluids.ts";
import { atGoal, findItem, goTo, interrupt, isReserved, reserve } from "./ai.ts";
import { nearestHostile } from "./combat.ts";
import { workPriority } from "./worktypes.ts";
import { registerJob, registerWorkGiver } from "./jobs.ts";
import type { Game } from "./game.ts";
import { untendedInjuries } from "./health.ts";
import { takeFromStack } from "./items.ts";
import { NO_THING } from "./map.ts";
import { addMemory, addStat, learn, skillLevel, type Job, type Pawn } from "./pawn.ts";
import { changeOpinion } from "./social.ts";
import { pickUp } from "./hauling.ts";

const TEND_WORK = 90;

export function inBed(game: Game, p: Pawn): boolean {
  const L = game.map.layers[p.layer];
  const th = L.thing[L.i(p.x, p.y)];
  return th !== NO_THING && !!game.reg.things.list[game.things.get(th)!.def].bed;
}

function freeBed(game: Game, p: Pawn, patient: Pawn): { layer: number; x: number; y: number; id: number } | null {
  const occupied = new Set([...game.pawns.values()].filter((o) => o.id !== patient.id && inBed(game, o)).map((o) => `${o.layer},${o.x},${o.y}`));
  const beds = [...game.things.values()]
    .filter((t) => game.reg.things.list[t.def].bed && !t.forPrisoners && !occupied.has(`${t.layer},${t.x},${t.y}`) && !isReserved(game, `thing:${t.id}`, p))
    .sort((a, b) => (a.x - p.x) ** 2 + (a.y - p.y) ** 2 - ((b.x - p.x) ** 2 + (b.y - p.y) ** 2));
  return beds.find((b) => game.path.canReach(p, b)) ?? null;
}

/** The care a doctor can give one patient now (rescue, feed or tend), or null. */
function careFor(game: Game, p: Pawn, patient: Pawn): Job | null {
  // 1. Rescue: downed and not in a bed, and there is a free bed.
  if (patient.health.downed && !inBed(game, patient)) {
    const bed = freeBed(game, p, patient);
    if (bed && reserve(game, `pawn:${patient.id}`, p) && reserve(game, `thing:${bed.id}`, p))
      return { kind: "rescue", stage: 0, targetId: patient.id, target: { layer: bed.layer, x: bed.x, y: bed.y } };
  }
  // 2. Feed: downed patients cannot eat or drink on their own.
  if (patient.health.downed && (patient.needs.hunger < 0.4 || patient.needs.thirst < 0.4)) {
    // The lower need first; when nothing is there for it, the other one.
    const order: ("water" | "food")[] = patient.needs.thirst < patient.needs.hunger ? ["water", "food"] : ["food", "water"];
    for (const want of order) {
      if ((want === "water" ? patient.needs.thirst : patient.needs.hunger) >= 0.4) continue;
      // Near death, dirty or glowing water and food are better than none.
      const desperate = (want === "water" ? patient.needs.thirst : patient.needs.hunger) < 0.15;
      const src = findItem(game, p, (d, cont) => game.reg.items.list[d].category === want && (desperate || !cont));
      if (src !== null && reserve(game, `pawn:${patient.id}`, p) && reserve(game, `item:${src}`, p))
        return { kind: "feed", stage: 0, targetId: patient.id, data: { src } };
      // No water jugs: fill one at a well, tap or rain collector (any water source the survivors drink from) and carry it over.
      if (want === "water") {
        const well = [...game.things.values()].find((t) => {
          const d = game.reg.things.list[t.def];
          return (d.water === "clean" || (desperate && !!d.water)) && (d.fluid?.role !== "tap" || tapHasWater(game, t)) && game.path.canReachAdjacent(p, t);
        });
        if (well && reserve(game, `pawn:${patient.id}`, p)) return { kind: "feed", stage: 0, targetId: patient.id, data: { well: well.id } };
      }
    }
  }
  // 3. Tend: untended wounds. Downed or resting patients first; others also get tended where they stand.
  if (untendedInjuries(patient).length > 0 && reserve(game, `pawn:${patient.id}`, p)) {
    const bandage = findItem(game, p, (d) => !!game.reg.items.list[d].medicine);
    if (bandage !== null && reserve(game, `item:${bandage}`, p)) return { kind: "tend", stage: 0, targetId: patient.id, data: { med: bandage } };
    return { kind: "tend", stage: 1, targetId: patient.id, data: { med: -1 } };
  }
  return null;
}

registerWorkGiver({
  workType: "doctor",
  give(game, p): Job | null {
    for (const patient of game.pawns.values()) {
      // Doctors treat prisoners too (they are fed by wardens, not here).
      if ((patient.faction !== "colony" && patient.faction !== "prisoner") || patient.robot || patient.id === p.id || isReserved(game, `pawn:${patient.id}`, p)) continue;
      if (patient.faction === "prisoner") {
        if (untendedInjuries(patient).length === 0 || !game.path.canReachAdjacent(p, patient) || !reserve(game, `pawn:${patient.id}`, p)) continue;
        const bandage = findItem(game, p, (d) => !!game.reg.items.list[d].medicine);
        if (bandage !== null && reserve(game, `item:${bandage}`, p)) return { kind: "tend", stage: 0, targetId: patient.id, data: { med: bandage } };
        return { kind: "tend", stage: 1, targetId: patient.id, data: { med: -1 } };
      }
      if (!game.path.canReachAdjacent(p, patient)) continue;
      const job = careFor(game, p, patient);
      if (job) return job;
    }
    return null;
  },
});

/** Jobs a doctor does not drop for an alarm. */
const KEEP_FOR_ALARM = new Set(["rescue", "feed", "tend", "flee", "shelter", "eat", "drink"]);

/**
 * Alarm: a downed survivor lies outside a bed, or is thirsty, hungry or has open wounds, and nobody helps. The nearest free doctor drops their
 * work and runs over, unless enemies are still near the patient. Sulking survivors answer too. Call every few ticks.
 */
export function rushToDowned(game: Game): void {
  for (const patient of game.pawns.values()) {
    if (patient.faction !== "colony" || patient.robot || !patient.health.downed) continue;
    const needsCare = !inBed(game, patient) || patient.needs.thirst < 0.3 || patient.needs.hunger < 0.3 || untendedInjuries(patient).length > 0;
    if (!needsCare) continue;
    if (game.reservations.has(`pawn:${patient.id}`) && game.pawns.has(game.reservations.get(`pawn:${patient.id}`)!)) continue;
    if (nearestHostile(game, patient, "colony", 10)) continue;
    const doctors = [...game.pawns.values()]
      .filter(
        (d) =>
          d.faction === "colony" && d.id !== patient.id && !d.health.downed && !d.drafted &&
          workPriority(d, "doctor") > 0 && !(d.job && KEEP_FOR_ALARM.has(d.job.kind)) &&
          d.needs.hunger >= 0.2 && d.needs.thirst >= 0.2 && d.layer === patient.layer,
      )
      .sort((a, b) => (a.x - patient.x) ** 2 + (a.y - patient.y) ** 2 - ((b.x - patient.x) ** 2 + (b.y - patient.y) ** 2));
    for (const d of doctors) {
      // Ask first: drop the old job only when there is care to give (the old job's reservations go with it).
      if (!game.path.canReachAdjacent(d, patient) || !careFor(game, d, patient)) continue;
      interrupt(game, d);
      d.job = careFor(game, d, patient);
      break;
    }
  }
}

registerJob("rescue", (game, p, job) => {
  const patient = game.pawns.get(job.targetId!);
  if (!patient || !patient.health.downed) return "fail";
  if (job.stage === 0) {
    if (!goTo(game, p, patient, true)) return "fail";
    job.stage = 1;
  }
  if (job.stage === 1) {
    if (!atGoal(p)) return "run";
    if (!goTo(game, p, job.target!)) return "fail";
    job.stage = 2;
  }
  // Carry: the patient moves with the doctor.
  patient.layer = p.layer;
  patient.x = p.x;
  patient.y = p.y;
  if (!atGoal(p)) return "run";
  // Being carried to safety is not forgotten.
  changeOpinion(game, patient, p, 12);
  addStat(p, "rescues");
  addMemory(game, patient, "rescued");
  return "done";
});

registerJob("feed", (game, p, job) => {
  const patient = game.pawns.get(job.targetId!);
  if (!patient) return "fail";
  if (job.data!.well !== undefined) {
    // Water from a well: walk there, fill a jug, bring it.
    const well = game.things.get(job.data!.well as number);
    if (!well) return "fail";
    if (job.stage === 0) {
      if (!goTo(game, p, well, true)) return "fail";
      job.stage = 1;
    }
    if (job.stage === 1) {
      if (!atGoal(p)) return "run";
      const def = game.reg.items.idx(game.reg.things.list[well.def].water === "clean" ? "clean_water" : "dirty_water");
      const cont = (well.contamUntil ?? 0) > game.tick;
      p.carrying = { id: game.newId(), def, count: 2, layer: -1, x: 0, y: 0, ...(cont ? { contaminated: true, contamUntil: well.contamUntil } : {}) };
      if (!goTo(game, p, patient, true)) return "fail";
      job.stage = 2;
    }
  }
  if (job.stage === 0) {
    const s = game.items.get(job.data!.src as number);
    if (!s || !goTo(game, p, s)) return "fail";
    job.stage = 1;
  }
  if (job.stage === 1) {
    if (!atGoal(p)) return "run";
    const s = game.items.get(job.data!.src as number);
    if (!s) return "fail";
    const def = game.reg.items.list[s.def];
    const per = def.category === "water" ? def.hydration : def.nutrition;
    const have = def.category === "water" ? patient.needs.thirst : patient.needs.hunger;
    const units = Math.max(1, Math.min(s.count, Math.floor((1 - have) / Math.max(0.01, per))));
    if (pickUp(game, p, s.id, units) <= 0) return "fail";
    if (!goTo(game, p, patient, true)) return "fail";
    job.stage = 2;
  }
  if (!atGoal(p) || !p.carrying) return p.carrying ? "run" : "fail";
  const def = game.reg.items.list[p.carrying.def];
  if (def.category === "water") patient.needs.thirst = Math.min(1, patient.needs.thirst + p.carrying.count * def.hydration);
  else patient.needs.hunger = Math.min(1, patient.needs.hunger + p.carrying.count * def.nutrition);
  p.carrying = null;
  return "done";
});

registerJob("tend", (game, p, job) => {
  const patient = game.pawns.get(job.targetId!);
  if (!patient || untendedInjuries(patient).length === 0) return "fail";
  if (job.stage === 0) {
    const s = game.items.get(job.data!.med as number);
    if (!s) {
      job.data!.med = -1;
      job.stage = 1;
    } else if (!p.path?.length && !(p.x === s.x && p.y === s.y)) {
      if (!goTo(game, p, s)) return "fail";
      return "run";
    } else if (atGoal(p)) {
      takeFromStack(game, s.id, 1);
      job.data!.quality = game.reg.items.list[s.def].medicine ?? 0.3;
      job.stage = 1;
    } else return "run";
  }
  if (job.stage === 1) {
    // Follow the patient if they walk away.
    if (!p.goal || p.goal.pos.x !== patient.x || p.goal.pos.y !== patient.y) {
      if (Math.max(Math.abs(p.x - patient.x), Math.abs(p.y - patient.y)) > 1 && !goTo(game, p, patient, true)) return "fail";
    }
    if (!atGoal(p)) return "run";
    job.stage = 2;
    job.data!.work = TEND_WORK;
  }
  if (Math.max(Math.abs(p.x - patient.x), Math.abs(p.y - patient.y)) > 1) {
    job.stage = 1;
    return "run";
  }
  job.data!.work = (job.data!.work as number) - 1;
  learn(game, p, "medicine", 0.6);
  if ((job.data!.work as number) > 0) return "run";
  const base = (job.data!.quality as number) ?? 0.25;
  const q = Math.min(1, Math.max(0.1, base * (0.6 + skillLevel(game, p, "medicine") * 0.04)));
  for (const i of untendedInjuries(patient)) i.tended = q;
  game.message("msg.tended", { doctor: p.nick, name: patient.nick });
  return "done";
});

// ---------------------------------------------------------------- equip weapons

export function equipJob(game: Game, p: Pawn): Job | null {
  if (p.weapon !== null || p.faction !== "colony" || p.robot) return null;
  const ranged = findItem(game, p, (d) => (game.reg.items.list[d].weapon?.range ?? 0) > 1.5);
  const w = ranged ?? findItem(game, p, (d) => !!game.reg.items.list[d].weapon);
  if (w === null || !reserve(game, `item:${w}`, p)) return null;
  return { kind: "equip", stage: 0, targetId: w };
}


registerJob("equip", (game, p, job) => {
  const s = game.items.get(job.targetId!);
  if (!s) return "fail";
  if (job.stage === 0) {
    if (!goTo(game, p, s)) return "fail";
    job.stage = 1;
  }
  if (!atGoal(p)) return "run";
  if (p.weapon !== null) return "done";
  const def = s.def;
  if (takeFromStack(game, s.id, 1) === 1) p.weapon = def;
  return "done";
});
