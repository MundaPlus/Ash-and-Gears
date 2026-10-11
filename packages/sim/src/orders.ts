/**
 * Direct orders from the player's menu (right-click a character with a survivor selected): attack,
 * put down, capture, rescue, tend, feed. The survivor drops what it does and does this now.
 */
import { interrupt } from "./ai.ts";
import { hostile } from "./combat.ts";
import type { Game } from "./game.ts";
import { kill, untendedInjuries } from "./health.ts";
import { orderAttack, setDrafted } from "./hostile.ts";
import { careJob, freeBed, inBed } from "./medical.ts";
import type { Pawn } from "./pawn.ts";
import { freePrisonBed, setCapture } from "./prison.ts";
import { registerTask, workJob, type WorkType } from "./work.ts";
import { canDesignate, designate } from "./designations.ts";
import { Desig, NO_THING, type DesigKind } from "./map.ts";
import { canHaul, haulStackJob } from "./hauling.ts";
import { forceBuildJob } from "./construction.ts";
import { forceFarmTask } from "./farming.ts";
import { canStudy, studyJob } from "./research.ts";
import type { Job } from "./pawn.ts";
import { reserve } from "./ai.ts";

export type PawnAction = "attack" | "put_down" | "capture" | "rescue" | "tend" | "feed";

/** Things a survivor can be told to do on a tile right now (the player's menu, "force"). */
export type TileForce = "mine" | "salvage" | "cut" | "clear" | "deconstruct" | "unfloor" | "pry" | "claim" | "haul" | "harvest" | "sow" | "build" | "study";

/** Order kinds and the work type they belong to (a backstory that rules the work out still says no). */
const ORDER_WORK: Partial<Record<DesigKind, WorkType>> = {
  mine: "mine", salvage: "salvage", cut: "grow", clear: "construct", deconstruct: "construct", unfloor: "construct", pry: "construct", claim: "construct",
};

function can(actor: Pawn, w: WorkType): boolean {
  return !actor.noWork?.includes(w);
}

/** What the selected survivor could do on this tile now. */
export function tileForceActions(game: Game, actor: Pawn, layer: number, x: number, y: number): TileForce[] {
  if (actor.faction !== "colony" || actor.health.downed) return [];
  const L = game.map.layers[layer];
  if (!L.inBounds(x, y)) return [];
  const i = L.i(x, y);
  const out: TileForce[] = [];
  for (const [kind, w] of Object.entries(ORDER_WORK) as [DesigKind, WorkType][]) {
    const marked = L.desig[i] === Desig[kind];
    if ((marked || canDesignate(game, kind, layer, x, y)) && can(actor, w)) out.push(kind as TileForce);
  }
  const bp = game.blueprints.get(L.blueprint[i]);
  if (bp && can(actor, "construct")) out.push("build");
  const farm = forceFarmTask(game, layer, x, y);
  if (farm && can(actor, "grow")) out.push(farm.task);
  if (L.item[i] !== NO_THING && can(actor, "haul") && canHaul(game, L.item[i])) out.push("haul");
  // A manual a project needs: study it at a research desk now (user request).
  if (L.item[i] !== NO_THING && can(actor, "research") && !actor.robot && canStudy(game, L.item[i])) out.push("study");
  return out;
}

/** Whoever works this tile (by its reservation) lets go, so the forced survivor can take it. */
function takeOver(game: Game, actor: Pawn, key: string) {
  const other = game.reservations.get(key);
  if (other === undefined || other === actor.id) return;
  const o = game.pawns.get(other);
  if (o) interrupt(game, o);
  game.reservations.delete(key);
}

/** Do it now: the survivor drops its job (and the draft) and goes. False (with a message) when it cannot. */
export function doTileForce(game: Game, actor: Pawn, layer: number, x: number, y: number, a: TileForce): boolean {
  if (!tileForceActions(game, actor, layer, x, y).includes(a)) return false;
  if (actor.drafted) setDrafted(game, actor, false);
  interrupt(game, actor);
  const L = game.map.layers[layer];
  const i = L.i(x, y);
  const pos = { layer, x, y };
  let job: Job | null;
  if (a === "study") {
    takeOver(game, actor, `item:${L.item[i]}`);
    job = studyJob(game, actor, L.item[i]);
  } else if (a === "haul") {
    takeOver(game, actor, `item:${L.item[i]}`);
    job = haulStackJob(game, actor, L.item[i]);
  } else if (a === "build") {
    const bp = game.blueprints.get(L.blueprint[i])!;
    takeOver(game, actor, `tile:${layer},${x},${y}`);
    job = forceBuildJob(game, actor, bp);
  } else if (a === "sow" || a === "harvest") {
    const farm = forceFarmTask(game, layer, x, y)!;
    takeOver(game, actor, `tile:${layer},${x},${y}`);
    job = workJob(game, actor, a, pos);
    if (job && a === "sow") job.data!.crop = farm.crop;
  } else {
    // An order kind: mark the tile (if it is not yet), then take it.
    if (L.desig[i] !== Desig[a]) designate(game, a, layer, x, y);
    takeOver(game, actor, `tile:${layer},${x},${y}`);
    const th = L.thing[i];
    job = workJob(game, actor, a, pos, th === NO_THING ? undefined : th);
  }
  if (!job) {
    game.message("msg.order_failed", { name: actor.nick }, "warn", actor);
    return false;
  }
  actor.job = job;
  return true;
}

/** What a survivor can do to another character now. */
export function pawnActions(game: Game, actor: Pawn, target: Pawn): PawnAction[] {
  if (actor.faction !== "colony" || actor.health.downed || actor.id === target.id) return [];
  const out: PawnAction[] = [];
  if (hostile(actor, target)) {
    if (!target.health.downed) return ["attack"];
    if (actor.robot) return [];
    out.push("put_down");
    if (target.faction === "raiders" && freePrisonBed(game, actor)) out.push("capture");
    return out;
  }
  if (actor.robot || (target.faction !== "colony" && target.faction !== "prisoner")) return [];
  if (target.health.downed && !inBed(game, target) && freeBed(game, actor, target)) out.push("rescue");
  if (untendedInjuries(target).length) out.push("tend");
  if (target.health.downed && (target.needs.hunger < 0.7 || target.needs.thirst < 0.7)) out.push("feed");
  return out;
}

/** Do it: the survivor drops its job (and the draft, except to attack) and goes. False when not possible now. */
export function doPawnAction(game: Game, actor: Pawn, target: Pawn, a: PawnAction): boolean {
  if (!pawnActions(game, actor, target).includes(a)) return false;
  const ok = startAction(game, actor, target, a);
  // Nothing to do it with (no bandage needed, but e.g. no path or no food): say so.
  if (!ok) game.message("msg.order_failed", { name: actor.nick }, "warn", actor);
  return ok;
}

function startAction(game: Game, actor: Pawn, target: Pawn, a: PawnAction): boolean {
  if (a === "attack") {
    if (!actor.drafted) setDrafted(game, actor, true);
    orderAttack(game, actor, target);
    return true;
  }
  if (actor.drafted) setDrafted(game, actor, false);
  interrupt(game, actor);
  if (a === "put_down") {
    const job = workJob(game, actor, "finish", { layer: target.layer, x: target.x, y: target.y }, target.id);
    if (!job) return false;
    actor.job = job;
    return true;
  }
  if (a === "capture") {
    setCapture(game, target, true);
    const bed = freePrisonBed(game, actor);
    if (!bed || !reserve(game, `pawn:${target.id}`, actor) || !reserve(game, `thing:${bed.id}`, actor)) return false;
    actor.job = { kind: "capture", stage: 0, targetId: target.id, target: { layer: bed.layer, x: bed.x, y: bed.y }, data: { bed: bed.id } };
    return true;
  }
  const job = careJob(game, actor, target, a);
  if (!job) return false;
  actor.job = job;
  return true;
}

// Put down from the menu: any downed enemy (people too), by the player's word only.
registerTask("finish", {
  skill: "melee",
  xp: 0.2,
  total: () => 40,
  valid: (game, job) => {
    const t = game.pawns.get(job.targetId!);
    return !!t && t.health.downed && t.layer === job.target!.layer && t.x === job.target!.x && t.y === job.target!.y;
  },
  complete: (game, p, job) => {
    const t = game.pawns.get(job.targetId!);
    if (!t) return;
    t.lastAttacker = p.id;
    kill(game, t, "put_down");
  },
});
