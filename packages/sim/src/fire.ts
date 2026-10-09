/**
 * Fire (spec 06, demo: "fire (simple)"). A fire sits on a tile and burns the flammable thing there.
 * It grows, spreads to flammable neighbors, burns pawns standing in it, and dies in the rain.
 * Firefighters beat it out. Lightning in a storm can start one.
 */
import { atGoal, goTo, isReserved, reserve } from "./ai.ts";
import type { Game } from "./game.ts";
import { damage } from "./health.ts";
import { registerJob, registerWorkGiver } from "./jobs.ts";
import type { Pos } from "./path.ts";
import { learn } from "./pawn.ts";

const FIRE_EVERY = 20;

export function startFire(game: Game, layer: number, x: number, y: number, intensity = 0.3): void {
  const L = game.map.layers[layer];
  if (!L.inBounds(x, y)) return;
  const n = layer * L.w * L.h + L.i(x, y);
  game.fires.set(n, Math.max(game.fires.get(n) ?? 0, intensity));
  L.touch(x, y);
  game.mapVersion++;
}

function nodePos(game: Game, n: number): Pos {
  const { w, h } = game.map;
  const layer = Math.floor(n / (w * h));
  const r = n - layer * w * h;
  return { layer, x: r % w, y: Math.floor(r / w) };
}

function flammableAt(game: Game, layer: number, x: number, y: number): boolean {
  const def = game.thingDefAt(layer, x, y);
  return !!def?.flammable;
}

export function tickFire(game: Game): void {
  // Lightning: during rain, rarely, on a random outdoor plant.
  if (game.weather.kind === "rain" && game.tick % Math.round(game.ticksPerHour) === 0 && game.aiRng.chance(0.03)) {
    const L = game.map.layers[0];
    const x = game.aiRng.int(0, L.w - 1), y = game.aiRng.int(0, L.h - 1);
    if (flammableAt(game, 0, x, y) && !L.roof[L.i(x, y)]) {
      startFire(game, 0, x, y, 0.5);
      game.message("msg.lightning", {}, "warn");
    }
  }
  if (!game.fires.size || game.tick % FIRE_EVERY !== 0) return;
  const raining = game.weather.kind === "rain";
  for (const [n, intensity] of [...game.fires]) {
    const pos = nodePos(game, n);
    const L = game.map.layers[pos.layer];
    const roofed = L.roof[L.i(pos.x, pos.y)] === 1;
    let next = intensity;
    if (flammableAt(game, pos.layer, pos.x, pos.y)) {
      next = Math.min(1, next + 0.08);
      const th = game.things.get(L.thing[L.i(pos.x, pos.y)])!;
      th.hp -= Math.ceil(next * 8);
      if (th.hp <= 0) {
        game.removeThing(th.id);
        game.message("msg.burned_down", { thing: game.reg.things.list[th.def].id }, "warn");
      }
    } else next -= 0.15; // nothing left to burn
    if (raining && !roofed) next -= 0.25;
    // Spread to flammable neighbors.
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = pos.x + dx, y = pos.y + dy;
      if (L.inBounds(x, y) && flammableAt(game, pos.layer, x, y) && game.aiRng.chance(next * 0.12)) startFire(game, pos.layer, x, y, 0.2);
    }
    // Burn anyone standing in it.
    for (const p of game.pawns.values()) if (p.layer === pos.layer && p.x === pos.x && p.y === pos.y) damage(game, p, 2 + next * 4, "burn");
    if (next <= 0) game.fires.delete(n);
    else game.fires.set(n, next);
    L.touch(pos.x, pos.y);
  }
  game.mapVersion++;
}

// ---------------------------------------------------------------- firefighting

registerWorkGiver({
  workType: "firefight",
  give(game, p) {
    if (!game.fires.size) return null;
    let best: Pos | null = null, bestD = 40 * 40;
    for (const n of game.fires.keys()) {
      const pos = nodePos(game, n);
      const d = (pos.x - game.home.x) ** 2 + (pos.y - game.home.y) ** 2;
      // Only fires near the colony are worth the risk.
      if (d > 40 * 40 || isReserved(game, `fire:${n}`, p)) continue;
      const dp = (pos.x - p.x) ** 2 + (pos.y - p.y) ** 2;
      if (dp < bestD && game.path.canReachAdjacent(p, pos)) {
        bestD = dp;
        best = pos;
      }
    }
    if (!best) return null;
    const L = game.map.layers[best.layer];
    const n = best.layer * L.w * L.h + L.i(best.x, best.y);
    if (!reserve(game, `fire:${n}`, p)) return null;
    return { kind: "firefight", stage: 0, target: best, data: { node: n } };
  },
});

registerJob("firefight", (game, p, job) => {
  const n = job.data!.node as number;
  if (!game.fires.has(n)) return "done";
  if (job.stage === 0) {
    if (!goTo(game, p, job.target!, true)) return "fail";
    job.stage = 1;
  }
  if (!atGoal(p)) return "run";
  const left = game.fires.get(n)! - 0.012;
  learn(game, p, "construction", 0.1);
  if (left <= 0) {
    game.fires.delete(n);
    const t = job.target!;
    game.map.layers[t.layer].touch(t.x, t.y);
    game.mapVersion++;
    return "done";
  }
  game.fires.set(n, left);
  return "run";
});

