/**
 * Light (Beta B9). The surface is lit by day. Elsewhere, and at night, only light sources light a
 * spot: lamps with power and burning fires, within their light radius. Work in the dark is slower.
 * Robots see in the dark. (A mood thought for the dark was tried and cut: too many deaths in playtests.)
 */
import type { Game } from "./game.ts";
import type { Pawn } from "./pawn.ts";
import { isLit, isPowered } from "./power.ts";

/** Work speed in the dark. */
export const DARK_WORK = 0.8;

export function isDaylight(game: Game): boolean {
  const h = game.hourOfDay;
  return h >= 6 && h < 19.5;
}

const cache = new WeakMap<Game, { tick: number; lights: { layer: number; x: number; y: number; r2: number }[] }>();

/** Light sources that are on right now (one list per tick). */
function lights(game: Game) {
  const c = cache.get(game);
  if (c && c.tick === game.tick) return c.lights;
  const out: { layer: number; x: number; y: number; r2: number }[] = [];
  for (const t of game.things.values()) {
    const r = game.reg.things.list[t.def].light;
    if (!r || !isPowered(game, t) || !isLit(game, t)) continue;
    out.push({ layer: t.layer, x: t.x, y: t.y, r2: r * r });
  }
  cache.set(game, { tick: game.tick, lights: out });
  return out;
}

export function isLitAt(game: Game, layer: number, x: number, y: number): boolean {
  if (layer === 0 && isDaylight(game)) return true;
  return lights(game).some((l) => l.layer === layer && (l.x - x) ** 2 + (l.y - y) ** 2 <= l.r2);
}

/** Work speed factor from light at the pawn's spot. */
export function lightWorkFactor(game: Game, p: Pawn): number {
  return p.robot || isLitAt(game, p.layer, p.x, p.y) ? 1 : DARK_WORK;
}
