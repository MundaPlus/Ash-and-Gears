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
import { registerTask, workJob } from "./work.ts";
import { reserve } from "./ai.ts";

export type PawnAction = "attack" | "put_down" | "capture" | "rescue" | "tend" | "feed";

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
