/**
 * Combat (spec 06): line of sight, cover, hit chance, melee and ranged attacks, turrets.
 * Hit chance (ranged) = base + shooting skill + weapon accuracy - range - cover - target moving.
 */
import type { Game } from "./game.ts";
import { damage, manipulation } from "./health.ts";
import { NO_THING, type Thing } from "./map.ts";
import { learn, skillLevel, type Pawn } from "./pawn.ts";

export interface Attack {
  dmg: number;
  cooldown: number;
  range: number;
  accuracy: number;
  kind: string;
}

const FX_KEEP = 80;

export function hostile(a: Pawn, b: Pawn): boolean {
  return a.faction !== b.faction;
}

export function attackOf(game: Game, p: Pawn): Attack {
  if (p.weapon !== null) {
    const w = game.reg.items.list[p.weapon].weapon;
    if (w) return { ...w, accuracy: w.accuracy ?? 0 };
  }
  const a = game.reg.content.creatures[p.creature].attack;
  return { ...a, accuracy: a.accuracy ?? 0 };
}

export function isMelee(a: Attack): boolean {
  return a.range <= 1.5;
}

export function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function blocksSight(game: Game, layer: number, x: number, y: number): boolean {
  const L = game.map.layers[layer];
  const i = L.i(x, y);
  if (game.reg.terrain.list[L.terrain[i]].solid) return true;
  const th = L.thing[i];
  if (th === NO_THING) return false;
  const d = game.reg.things.list[game.things.get(th)!.def];
  return d.blocksSight ?? (d.blocks && d.wall && !d.door);
}

/** Bresenham line from a to b; true if no tile in between blocks sight. */
export function canSee(game: Game, layer: number, a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  let x = a.x, y = a.y;
  const dx = Math.abs(b.x - x), dy = -Math.abs(b.y - y);
  const sx = x < b.x ? 1 : -1, sy = y < b.y ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    if (x === b.x && y === b.y) return true;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
    if ((x !== b.x || y !== b.y) && blocksSight(game, layer, x, y)) return false;
  }
}

/** Cover for a target from a shooter: the best cover thing on the tiles next to the target, facing the shooter. */
export function coverFor(game: Game, layer: number, target: { x: number; y: number }, from: { x: number; y: number }): number {
  if (dist(target, from) < 2) return 0;
  const L = game.map.layers[layer];
  const sx = Math.sign(from.x - target.x), sy = Math.sign(from.y - target.y);
  let best = 0;
  for (const [cx, cy] of [[target.x + sx, target.y + sy], [target.x + sx, target.y], [target.x, target.y + sy]]) {
    if (!L.inBounds(cx, cy) || (cx === target.x && cy === target.y)) continue;
    const th = L.thing[L.i(cx, cy)];
    if (th === NO_THING) continue;
    best = Math.max(best, game.reg.things.list[game.things.get(th)!.def].cover);
  }
  return best;
}

function pushFx(game: Game, fx: Game["fx"][number]) {
  game.fx.push(fx);
  if (game.fx.length > FX_KEEP) game.fx.splice(0, game.fx.length - FX_KEEP);
}

/** Chance a ranged shot hits. */
export function hitChance(game: Game, shooterSkill: number, atk: Attack, layer: number, from: { x: number; y: number }, target: Pawn): number {
  const d = dist(from, target);
  let c = 0.45 + shooterSkill * 0.025 + atk.accuracy - Math.max(0, d - 4) * 0.018;
  c -= coverFor(game, layer, target, from) * 0.6;
  if (target.path?.length) c -= 0.1;
  const size = game.reg.content.creatures[target.creature].size;
  c += (size - 1) * 0.3;
  return Math.max(0.05, Math.min(0.95, c));
}

/** True if p can attack target right now (range and sight). */
export function inAttackRange(game: Game, p: Pawn, target: Pawn): boolean {
  if (p.layer !== target.layer) return false;
  const atk = attackOf(game, p);
  const d = dist(p, target);
  if (isMelee(atk)) return d <= 1.5;
  return d <= atk.range && canSee(game, p.layer, p, target);
}

/** Attack if ready. Returns true if an attack happened. */
export function attack(game: Game, p: Pawn, target: Pawn): boolean {
  if (p.cooldown > 0 || !inAttackRange(game, p, target)) return false;
  const atk = attackOf(game, p);
  const melee = isMelee(atk);
  let hit: boolean;
  if (melee) {
    const skill = p.faction === "wild" ? 8 : skillLevel(game, p, "melee");
    const dodge = target.faction === "wild" ? 0.05 : skillLevel(game, target, "melee") * 0.01;
    hit = game.aiRng.chance(Math.min(0.95, 0.6 + skill * 0.02 - dodge));
    if (p.faction === "colony") learn(game, p, "melee", 4);
  } else {
    const skill = p.faction === "wild" ? 6 : skillLevel(game, p, "shooting");
    hit = game.aiRng.chance(hitChance(game, skill, atk, p.layer, p, target));
    if (p.faction === "colony") learn(game, p, "shooting", 4);
  }
  if (target.x !== p.x) p.facing = target.x > p.x ? 1 : -1;
  p.cooldown = Math.round(atk.cooldown / Math.max(0.3, manipulation(game, p)));
  pushFx(game, { kind: melee ? "melee" : "shot", layer: p.layer, from: { x: p.x, y: p.y }, to: { x: target.x, y: target.y }, hit, tick: game.tick });
  if (hit) {
    damage(game, target, atk.dmg, atk.kind);
    target.lastAttacker = p.id;
  }
  return true;
}

/** Nearest visible hostile within `range`, or null. */
export function nearestHostile(game: Game, p: { layer: number; x: number; y: number }, faction: string, range: number): Pawn | null {
  let best: Pawn | null = null, bestD = range;
  for (const o of game.pawns.values()) {
    if (o.faction === faction || o.layer !== p.layer || o.health.downed) continue;
    const d = dist(p, o);
    if (d <= bestD && canSee(game, p.layer, p, o)) {
      bestD = d;
      best = o;
    }
  }
  return best;
}

/** Turrets shoot the nearest hostile they can see. */
export function tickTurrets(game: Game): void {
  for (const t of game.things.values()) {
    const def = game.reg.things.list[t.def];
    if (!def.turret) continue;
    const cd = (game.turretCooldown.get(t.id) ?? 0) - 1;
    if (cd > 0) {
      game.turretCooldown.set(t.id, cd);
      continue;
    }
    if (!turretReady(game, t)) continue;
    const target = nearestHostile(game, t, "colony", def.turret.range);
    if (!target) {
      game.turretCooldown.set(t.id, 0);
      continue;
    }
    const atk: Attack = { ...def.turret };
    const hit = game.aiRng.chance(hitChance(game, 8, atk, t.layer, t, target));
    pushFx(game, { kind: "turret", layer: t.layer, from: { x: t.x, y: t.y }, to: { x: target.x, y: target.y }, hit, tick: game.tick });
    if (hit) damage(game, target, atk.dmg, atk.kind);
    game.turretCooldown.set(t.id, atk.cooldown);
  }
}

/** Power check hook. M6 makes turrets need power. */
export let turretReady: (game: Game, t: Thing) => boolean = () => true;
export function setTurretReady(fn: (game: Game, t: Thing) => boolean): void {
  turretReady = fn;
}
