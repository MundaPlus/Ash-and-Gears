/**
 * Robots (spec 12, Alpha A7): a workforce with limits. Robots are colony members with a machine
 * body: no hunger, thirst, sleep, mood or social life. They do only some work types, fight badly,
 * and run on charge. Below a quarter charge they go to a free powered robot bay; a robot on a bay
 * charges and gets repaired. A robot bay builds robots and hauler drones with bills.
 */
import { atGoal, goTo, isReserved, reserve } from "./ai.ts";
import type { Game } from "./game.ts";
import { registerJob } from "./jobs.ts";
import type { Thing } from "./map.ts";
import { makeSurvivor, type Job, type Pawn } from "./pawn.ts";
import { isPowered } from "./power.ts";
import { WORK_TYPES } from "./worktypes.ts";

/** Charge lost per in-game day of normal running. */
const DRAIN_PER_DAY = 0.8;
/** Charge gained per in-game hour on a powered bay. */
const CHARGE_PER_HOUR = 0.3;
/** Damage repaired per in-game hour on a powered bay (each injury). */
const REPAIR_PER_HOUR = 1.5;
const GO_CHARGE_AT = 0.25;

/** What each kind may do. Everything else is ruled out. */
const ALLOWED: Record<string, string[]> = {
  robot: ["firefight", "construct", "mine", "salvage", "craft", "haul"],
  hauler_drone: ["haul"],
};
const SKILLS: Record<string, Record<string, number>> = {
  robot: { construction: 6, mining: 6, crafting: 5, scavenging: 4, melee: 2 },
  hauler_drone: {},
};

export function isRobot(p: Pawn): boolean {
  return !!p.robot;
}

/** A new colony robot of the given creature kind ("robot" or "hauler_drone"). */
export function makeRobot(game: Game, kind: string, layer: number, x: number, y: number): Pawn {
  const p = makeSurvivor(game, layer, x, y, new Set());
  p.creature = Math.max(0, game.reg.content.creatures.findIndex((c) => c.id === kind));
  p.robot = true;
  p.charge = 1;
  const serial = [...game.pawns.values()].filter((o) => o.robot).length + 1;
  p.first = "";
  p.last = "";
  p.nick = `${kind === "hauler_drone" ? "D" : "R"}-${String(serial).padStart(2, "0")}`;
  p.age = 0;
  p.traits = [];
  delete p.backstory;
  p.noWork = WORK_TYPES.filter((w) => !(ALLOWED[kind] ?? []).includes(w));
  p.skills = game.reg.skills.list.map((s) => ({ level: SKILLS[kind]?.[s.id] ?? 0, xp: 0, passion: 0 }));
  p.memories = [];
  p.needs = { hunger: 1, thirst: 1, rest: 1 };
  p.mood = 50;
  return p;
}

/** Every tick for colony robots: charge runs down while they are off the bay. */
export function tickRobot(game: Game, p: Pawn): void {
  if (p.job?.kind === "charge" && p.job.stage === 2) return;
  const before = p.charge ?? 1;
  p.charge = Math.max(0, before - DRAIN_PER_DAY / game.ticksPerDay);
  if (before > 0 && p.charge === 0) game.message("msg.robot_low", { name: p.nick }, "warn");
}

function freeBay(game: Game, p: Pawn): Thing | null {
  const used = new Set([...game.pawns.values()].filter((o) => o.id !== p.id && o.job?.kind === "charge").map((o) => o.job!.targetId));
  const bays = [...game.things.values()]
    .filter((t) => game.reg.things.list[t.def].robotBay && isPowered(game, t) && !used.has(t.id) && !isReserved(game, `bay:${t.id}`, p))
    .sort((a, b) => (a.x - p.x) ** 2 + (a.y - p.y) ** 2 - ((b.x - p.x) ** 2 + (b.y - p.y) ** 2));
  return bays.find((b) => game.path.canReach(p, b)) ?? null;
}

/** Robots think here instead of the survivor decision tree. Returns the job, or null to do normal work. */
export function robotJob(game: Game, p: Pawn): Job | null | "idle" {
  const hurt = p.health.injuries.length > 0;
  if ((p.charge ?? 1) < GO_CHARGE_AT || hurt) {
    const bay = freeBay(game, p);
    if (bay && reserve(game, `bay:${bay.id}`, p)) return { kind: "charge", stage: 0, targetId: bay.id, target: { layer: bay.layer, x: bay.x, y: bay.y } };
  }
  // Out of charge and no bay: stand still.
  if ((p.charge ?? 1) <= 0) return "idle";
  return null;
}

registerJob("charge", (game, p, job) => {
  const bay = game.things.get(job.targetId!);
  if (!bay) return "fail";
  if (job.stage === 0) {
    if (!goTo(game, p, job.target!)) return "fail";
    job.stage = 1;
  }
  if (job.stage === 1) {
    if (!atGoal(p)) return "run";
    job.stage = 2;
  }
  if (!isPowered(game, bay)) return "fail";
  const perTick = 1 / game.ticksPerHour;
  p.charge = Math.min(1, (p.charge ?? 0) + CHARGE_PER_HOUR * perTick);
  for (const i of p.health.injuries) i.dmg = Math.max(0, i.dmg - REPAIR_PER_HOUR * perTick);
  p.health.injuries = p.health.injuries.filter((i) => i.dmg > 0.01);
  return p.charge >= 0.98 && p.health.injuries.length === 0 ? "done" : "run";
});

/** Number of robots of a kind in the colony (the "stock" for robot bills). */
export function robotCount(game: Game, kind: string): number {
  const idx = game.reg.content.creatures.findIndex((c) => c.id === kind);
  return [...game.pawns.values()].filter((p) => p.faction === "colony" && p.robot && p.creature === idx).length;
}
