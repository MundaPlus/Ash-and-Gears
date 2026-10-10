/**
 * Fighting behavior: drafted survivors (player orders), self-defense, fleeing,
 * and enemies (raiders, rad-rats, glow-hounds). See spec 06.
 */
import { atGoal, endJob, goTo } from "./ai.ts";
import { sharedEvent } from "./social.ts";
import { attack, attackOf, dist, hostile, inAttackRange, isMelee, nearestHostile } from "./combat.ts";
import type { Game } from "./game.ts";
import { pain } from "./health.ts";
import { takeFromStack } from "./items.ts";
import type { Pos } from "./path.ts";
import { addMemory, type Pawn } from "./pawn.ts";

const REPATH = 40;

/** Any adjacent enemy gets hit back, whatever the pawn is doing. */
export function selfDefense(game: Game, p: Pawn): boolean {
  if (p.cooldown > 0) return false;
  for (const o of game.pawns.values()) {
    if (!hostile(p, o) || o.layer !== p.layer || o.health.downed || dist(p, o) > 1.5) continue;
    return attack(game, p, o);
  }
  return false;
}

/** Walk toward a moving target, planning again now and then. */
function chase(game: Game, p: Pawn, target: Pos) {
  const stale = !p.goal || dist(p.goal.pos, target) > 2 || p.goal.pos.layer !== target.layer;
  if (stale || (game.tick + p.id) % REPATH === 0 || !p.path?.length) goTo(game, p, target, true);
}

// ---------------------------------------------------------------- drafted survivors

export function draftedTick(game: Game, p: Pawn): void {
  if (p.job) endJob(game, p, false);
  const o = p.order;
  if (o?.kind === "attack") {
    const target = game.pawns.get(o.target);
    if (!target || target.health.downed) p.order = null;
    else if (inAttackRange(game, p, target)) {
      p.path = null;
      attack(game, p, target);
      return;
    } else {
      chase(game, p, target);
      return;
    }
  }
  if (o?.kind === "move") {
    if (!p.goal || p.goal.pos.x !== o.pos.x || p.goal.pos.y !== o.pos.y || p.goal.pos.layer !== o.pos.layer) {
      if (!goTo(game, p, o.pos)) p.order = null;
    }
    if (atGoal(p)) p.order = null;
  }
  // Standing still: shoot at anything in range. Melee fighters charge enemies that come within 6 tiles.
  if (!p.path?.length) {
    const atk = attackOf(game, p);
    const melee = isMelee(atk);
    const target = nearestHostile(game, p, p.faction, melee ? 6 : atk.range);
    if (target && melee && dist(p, target) > 1.5) p.order = { kind: "attack", target: target.id };
    else if (target) attack(game, p, target);
  }
}

export function setDrafted(game: Game, p: Pawn, on: boolean): void {
  if (p.faction !== "colony" || p.health.downed) return;
  p.drafted = on;
  p.order = null;
  if (p.job) endJob(game, p, false);
  p.path = null;
  p.goal = null;
}

export function orderMove(game: Game, p: Pawn, pos: Pos): void {
  if (!p.drafted) setDrafted(game, p, true);
  p.order = { kind: "move", pos };
  p.goal = null;
}

export function orderAttack(game: Game, p: Pawn, target: Pawn): void {
  if (!p.drafted) setDrafted(game, p, true);
  p.order = { kind: "attack", target: target.id };
  p.goal = null;
}

// ---------------------------------------------------------------- fleeing (undrafted survivors)

/** An undrafted survivor near a visible enemy runs away from it. */
export function fleeFrom(game: Game, p: Pawn): boolean {
  const threat = nearestHostile(game, p, "colony", 9);
  if (!threat) return false;
  if (p.job?.kind === "flee") return true;
  // Run directly away; try a few distances.
  const dx = p.x - threat.x, dy = p.y - threat.y;
  const len = Math.hypot(dx, dy) || 1;
  for (const r of [14, 10, 6]) {
    const pos = { layer: p.layer, x: Math.round(p.x + (dx / len) * r), y: Math.round(p.y + (dy / len) * r) };
    if (game.walkable(pos.layer, pos.x, pos.y) && game.path.canReach(p, pos)) {
      if (p.job) endJob(game, p, false);
      p.job = { kind: "flee", stage: 0, target: pos, until: game.tick + 200 };
      goTo(game, p, pos);
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------- enemies

function nearestEdge(game: Game, p: Pawn): Pos {
  const { w, h } = game.map;
  const opts: Pos[] = [
    { layer: 0, x: 0, y: p.y },
    { layer: 0, x: w - 1, y: p.y },
    { layer: 0, x: p.x, y: 0 },
    { layer: 0, x: p.x, y: h - 1 },
  ];
  opts.sort((a, b) => dist(a, p) - dist(b, p));
  return opts[0];
}

export function leave(game: Game, p: Pawn) {
  if (p.layer !== 0 || p.x <= 0 || p.y <= 0 || p.x >= game.map.w - 1 || p.y >= game.map.h - 1) {
    game.pawns.delete(p.id);
    return;
  }
  if (!p.path?.length) {
    const edge = nearestEdge(game, p);
    // Edge tiles may be blocked; search along the edge.
    for (let k = 0; k < 40; k++) {
      const pos = { ...edge, x: Math.min(game.map.w - 1, Math.max(0, edge.x + (edge.x === 0 || edge.x === game.map.w - 1 ? 0 : k * (k % 2 ? 1 : -1)))), y: Math.min(game.map.h - 1, Math.max(0, edge.y + (edge.y === 0 || edge.y === game.map.h - 1 ? 0 : k * (k % 2 ? 1 : -1)))) };
      if (game.walkable(0, pos.x, pos.y) && goTo(game, p, pos)) return;
    }
    game.pawns.delete(p.id); // nowhere to go: vanish into the wasteland
  }
}

function nearestColonist(game: Game, p: Pawn): Pawn | null {
  let best: Pawn | null = null, bestD = Infinity;
  for (const o of game.pawns.values()) {
    if (o.faction !== "colony" || o.health.downed) continue;
    const d = dist(p, o) + (o.layer !== p.layer ? 50 : 0);
    if (d < bestD && game.path.canReach(p, o)) {
      bestD = d;
      best = o;
    }
  }
  return best;
}

/** Group morale: a group flees once half of it is dead or down. */
export function updateGroups(game: Game): void {
  const defended = [...game.pawns.values()].some((p) => p.faction === "colony" && !p.health.downed);
  for (const g of game.groups.values()) {
    // Nobody left standing: the attackers take what they want and go.
    if (defended) g.beatenAt = undefined;
    else if (g.beatenAt === undefined) {
      g.beatenAt = game.tick;
      game.message(`msg.${g.kind}_won`, {}, "bad");
    }
    const members = [...game.pawns.values()].filter((p) => p.group === g.id);
    const fighting = members.filter((p) => !p.health.downed).length;
    // Rats scatter after losing a third; raiders and hounds after losing half.
    const breakAt = g.kind === "rad_rats" ? g.size * 0.67 : g.size / 2;
    if (!g.fleeing && fighting <= breakAt) {
      g.fleeing = true;
      game.message(`msg.${g.kind}_fled`, {}, "info");
    }
    if (members.length === 0 || (g.fleeing && fighting === 0)) {
      game.groups.delete(g.id);
      // Downed enemies left behind bleed out on their own.
      if (g.kind === "raid" && [...game.pawns.values()].some((p) => p.faction === "colony")) {
        game.story.raidsSurvived++;
        for (const p of game.pawns.values()) if (p.faction === "colony") addMemory(game, p, "survived_raid");
        sharedEvent(game, 4);
      }
    }
  }
}

export function hostileTick(game: Game, p: Pawn): void {
  const creature = game.reg.content.creatures[p.creature];
  const group = p.group !== null ? game.groups.get(p.group) : undefined;
  // Hounds hunt at night and leave at dawn.
  const daylight = game.hourOfDay >= 6 && game.hourOfDay < 19;
  // Groups do not stay forever: rats get bored, raiders give up.
  const stayHours = creature.behavior === "food_swarm" ? 8 : creature.behavior === "hunter" ? 10 : 18;
  // No group (its raid already ended, e.g. this one got up again after being downed): go home.
  const orphan = p.group !== null && !group;
  const beaten = group?.beatenAt !== undefined && game.tick - group.beatenAt > game.ticksPerHour;
  const overstayed = orphan || beaten || (!!group && game.tick - group.arrived > stayHours * game.ticksPerHour);
  // Animals bolt once badly hurt; raiders hold on a little longer.
  const painLimit = creature.behavior === "human" ? 0.6 : 0.4;
  if (overstayed || group?.fleeing || pain(game, p) > painLimit || (creature.behavior === "hunter" && daylight && game.tick - (group?.arrived ?? 0) > game.ticksPerHour * 3)) {
    leave(game, p);
    return;
  }
  if (selfDefense(game, p)) return;

  if (creature.behavior === "food_swarm") {
    // Rats go for food first, then for people.
    let food: { layer: number; x: number; y: number; id: number } | null = null;
    let bestD = Infinity;
    for (const s of game.items.values()) {
      // Chests keep rats out.
      if (s.layer !== p.layer || s.chest !== undefined || game.reg.items.list[s.def].category !== "food") continue;
      const d = dist(p, s);
      if (d < bestD) {
        bestD = d;
        food = s;
      }
    }
    if (food) {
      if (dist(p, food) <= 1.5) {
        p.path = null;
        // A rat nibbles one unit every two in-game minutes or so; a swarm is a nuisance, not a famine.
        if ((game.tick + p.id) % 120 === 0) takeFromStack(game, food.id, 1);
      } else chase(game, p, food);
      return;
    }
  }

  const target = nearestColonist(game, p);
  if (!target) {
    if (!p.path?.length) goTo(game, p, game.home, true);
    return;
  }
  if (inAttackRange(game, p, target)) {
    p.path = null;
    attack(game, p, target);
  } else chase(game, p, target);
}
