/**
 * Prisoners and recruiting (spec 12, Alpha A6). The player marks a downed raider for capture and a
 * bed "for prisoners". A warden carries the raider to that bed; the raider becomes a prisoner and
 * stays there. Wardens feed prisoners and talk with them: each talk lowers resistance (social
 * skill helps). At zero resistance a talk may recruit the prisoner into the colony. A released
 * prisoner walks off the map. A prisoner nobody talks to for two days may slip away.
 */
import { atGoal, findItem, goTo, isReserved, reserve } from "./ai.ts";
import type { Game } from "./game.ts";
import { leave } from "./hostile.ts";
import { changeGoodwill } from "./factions.ts";
import { registerJob, registerWorkGiver } from "./jobs.ts";
import type { Thing } from "./map.ts";
import { addMemory, learn, skillLevel, type Job, type Pawn } from "./pawn.ts";

/** Hours between two persuasion talks with the same prisoner. */
const PERSUADE_EVERY = 6;
/** Hours a persuasion talk takes. */
const PERSUADE_HOURS = 0.5;

/** Mark (or unmark) a downed raider for capture. */
export function setCapture(game: Game, p: Pawn, on: boolean): void {
  if (on && (p.faction !== "raiders" || !p.health.downed)) return;
  if (on) p.capture = true;
  else delete p.capture;
  void game;
}

export type BedUse = "colonist" | "prisoner" | "medical";

export function bedUse(t: Thing): BedUse {
  return t.forPrisoners ? "prisoner" : t.medical ? "medical" : "colonist";
}

/** Set who a bed is for: colonists (owned, to sleep), prisoners, or the sick and hurt (medical). */
export function setBedUse(game: Game, t: Thing, use: BedUse): void {
  if (!game.reg.things.list[t.def].bed) return;
  delete t.forPrisoners;
  delete t.medical;
  if (use === "prisoner") t.forPrisoners = true;
  if (use === "medical") t.medical = true;
  // Whoever owned the bed gives it up when it is no longer a colonist bed; prisoners move out of a non-prison bed.
  for (const p of game.pawns.values()) {
    if (p.bedId !== t.id) continue;
    if ((p.faction === "colony" && use !== "colonist") || (p.faction === "prisoner" && use !== "prisoner")) p.bedId = null;
  }
}

/** Who owns a colonist bed, or null. */
export function bedOwner(game: Game, t: Thing): Pawn | null {
  for (const p of game.pawns.values()) if (p.faction === "colony" && p.bedId === t.id) return p;
  return null;
}

/**
 * Give a colonist bed to one survivor (they give up their old bed), or `null`: nobody owns it, and the
 * next survivor without a bed claims it when they go to sleep.
 */
export function assignBed(game: Game, t: Thing, pawnId: number | null): void {
  if (!game.reg.things.list[t.def].bed || bedUse(t) !== "colonist") return;
  const p = pawnId === null ? undefined : game.pawns.get(pawnId);
  if (pawnId !== null && (!p || p.faction !== "colony" || p.robot)) return;
  for (const o of game.pawns.values()) if (o.faction === "colony" && o.bedId === t.id) o.bedId = null;
  if (p) p.bedId = t.id;
}

/** Mark a bed for prisoners (or back for colonists). */
export function setPrisonBed(game: Game, t: Thing, on: boolean): void {
  setBedUse(game, t, on ? "prisoner" : "colonist");
}

export function freePrisonBed(game: Game, p: Pawn): Thing | null {
  const used = new Set([...game.pawns.values()].filter((o) => o.faction === "prisoner").map((o) => o.bedId));
  const beds = [...game.things.values()]
    .filter((t) => t.forPrisoners && game.reg.things.list[t.def].bed && !used.has(t.id) && !isReserved(game, `thing:${t.id}`, p))
    .sort((a, b) => (a.x - p.x) ** 2 + (a.y - p.y) ** 2 - ((b.x - p.x) ** 2 + (b.y - p.y) ** 2));
  return beds.find((b) => game.path.canReach(p, b)) ?? null;
}

/** Turn a captured raider into a prisoner on a bed. */
export function makePrisoner(game: Game, p: Pawn, bed: Thing): void {
  p.faction = "prisoner";
  p.group = null;
  p.drafted = false;
  p.order = null;
  delete p.capture;
  p.bedId = bed.id;
  p.resistance ??= 8 + game.aiRng.int(0, 17);
  p.lastTalk = game.tick;
  p.needs = { hunger: Math.min(p.needs.hunger, 0.6), thirst: Math.min(p.needs.thirst, 0.6), rest: p.needs.rest, fun: p.needs.fun };
  game.message("msg.captured", { name: p.nick }, "info", p);
  if (p.origin) changeGoodwill(game, p.origin, -5);
}

/** A prisoner joins the colony. */
export function recruit(game: Game, p: Pawn): void {
  p.faction = "colony";
  p.bedId = null;
  delete p.resistance;
  delete p.lastTalk;
  p.work = {};
  game.message("msg.recruited", { name: p.nick }, "info", p);
  if (p.origin) changeGoodwill(game, p.origin, -10);
  for (const c of game.pawns.values()) if (c.faction === "colony" && c.id !== p.id) addMemory(game, c, "wanderer_joined");
}

/** Let a prisoner go: they walk off the map. */
export function release(game: Game, p: Pawn): void {
  if (p.faction !== "prisoner") return;
  p.faction = "visitor";
  p.bedId = null;
  game.message("msg.released", { name: p.nick }, "info");
  if (p.origin) changeGoodwill(game, p.origin, 12);
}

/** Prisoners and visitors: what they do each tick (instead of the colony AI). */
export function prisonerTick(game: Game, p: Pawn): void {
  if (p.faction === "visitor") {
    leave(game, p);
    return;
  }
  // Two days without a talk: a chance each hour to slip away.
  if (game.tick % Math.round(game.ticksPerHour) === 0 && game.tick - (p.lastTalk ?? game.tick) > game.ticksPerDay * 2 && game.aiRng.chance(0.03)) {
    p.faction = "visitor";
    p.bedId = null;
    game.message("msg.escaped", { name: p.nick }, "warn", p);
    return;
  }
  const bed = p.bedId !== null ? game.things.get(p.bedId) : undefined;
  if (!bed) return;
  if ((p.x !== bed.x || p.y !== bed.y || p.layer !== bed.layer) && !p.path?.length) goTo(game, p, bed);
}

// ---------------------------------------------------------------- warden work

registerWorkGiver({
  workType: "warden",
  give(game, p): Job | null {
    for (const o of game.pawns.values()) {
      if (isReserved(game, `pawn:${o.id}`, p)) continue;
      // 1. Capture a marked, downed raider.
      if (o.capture && o.health.downed && o.faction === "raiders") {
        if (!game.path.canReachAdjacent(p, o)) continue;
        const bed = freePrisonBed(game, p);
        if (bed && reserve(game, `pawn:${o.id}`, p) && reserve(game, `thing:${bed.id}`, p))
          return { kind: "capture", stage: 0, targetId: o.id, target: { layer: bed.layer, x: bed.x, y: bed.y }, data: { bed: bed.id } };
        continue;
      }
      if (o.faction !== "prisoner" || !game.path.canReachAdjacent(p, o)) continue;
      // 2. Feed: prisoners only eat and drink what wardens bring.
      if (o.needs.hunger < 0.4 || o.needs.thirst < 0.4) {
        const want = o.needs.thirst < o.needs.hunger ? "water" : "food";
        const src = findItem(game, p, (d, cont) => game.reg.items.list[d].category === want && !cont);
        if (src !== null && reserve(game, `pawn:${o.id}`, p) && reserve(game, `item:${src}`, p))
          return { kind: "feed", stage: 0, targetId: o.id, data: { src } };
      }
      // 3. Talk: lower resistance, maybe recruit.
      if (!o.health.downed && game.tick - (o.lastTalk ?? 0) > PERSUADE_EVERY * game.ticksPerHour && reserve(game, `pawn:${o.id}`, p))
        return { kind: "persuade", stage: 0, targetId: o.id };
    }
    return null;
  },
});

registerJob("capture", (game, p, job) => {
  const raider = game.pawns.get(job.targetId!);
  const bed = game.things.get(job.data!.bed as number);
  if (!raider || !bed || !raider.health.downed || raider.faction !== "raiders") return "fail";
  if (job.stage === 0) {
    if (!goTo(game, p, raider, true)) return "fail";
    job.stage = 1;
  }
  if (job.stage === 1) {
    if (!atGoal(p)) return "run";
    if (!goTo(game, p, job.target!)) return "fail";
    job.stage = 2;
  }
  // Carry: the raider moves with the warden.
  raider.layer = p.layer;
  raider.x = p.x;
  raider.y = p.y;
  if (!atGoal(p)) return "run";
  makePrisoner(game, raider, bed);
  return "done";
});

registerJob("persuade", (game, p, job) => {
  const o = game.pawns.get(job.targetId!);
  if (!o || o.faction !== "prisoner") return "fail";
  if (job.stage === 0) {
    if (!goTo(game, p, o, true)) return "fail";
    job.stage = 1;
  }
  if (job.stage === 1) {
    if (!atGoal(p)) return "run";
    job.until = game.tick + Math.round(game.ticksPerHour * PERSUADE_HOURS);
    job.stage = 2;
  }
  if (game.tick < job.until!) return "run";
  const social = skillLevel(game, p, "social");
  o.lastTalk = game.tick;
  learn(game, p, "social", 2);
  if ((o.resistance ?? 0) > 0) {
    o.resistance = Math.max(0, (o.resistance ?? 0) - (1 + social / 4) * (0.6 + game.aiRng.next() * 0.8));
    return "done";
  }
  if (game.aiRng.chance(0.25 + social * 0.025)) recruit(game, o);
  return "done";
});
