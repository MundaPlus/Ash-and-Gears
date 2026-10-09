/**
 * Rooms, roofs and temperature (spec 03, "Rooms" and "Temperature").
 * A room is a 4-connected area bounded by walls, doors or solid rock.
 * On the surface, an area that touches the map edge (or is huge) is "outdoors".
 * Enclosed surface rooms get a roof automatically. Underground counts as roofed everywhere.
 */
import type { Game } from "./game.ts";
import { NO_THING } from "./map.ts";

export interface Room {
  id: number;
  layer: number;
  size: number;
  outdoor: boolean;
  /** Average insulation of the room's boundary (walls, doors, rock). */
  insulation: number;
  /** Degrees Celsius. */
  temp: number;
}

/** Bigger enclosed areas count as outdoors (no roof). */
export const MAX_ROOM = 900;
const TEMP_EVERY = 60;
const UNDERGROUND_TEMP = 13;
const SEASON_BASE = [12, 24, 10, -4];

export function outdoorTemp(game: Game, layer: number): number {
  if (layer > 0) return UNDERGROUND_TEMP - (layer - 1) * 2;
  const season = Math.floor((game.tick / game.ticksPerDay) / game.opts.seasonDays) % 4;
  const daily = 6 * Math.sin(((game.hourOfDay - 9) * Math.PI) / 12);
  return SEASON_BASE[season] + daily + game.weatherTempOffset;
}

function isBoundary(game: Game, layer: number, i: number): boolean {
  const L = game.map.layers[layer];
  if (game.reg.terrain.list[L.terrain[i]].solid) return true;
  const th = L.thing[i];
  return th !== NO_THING && game.reg.things.list[game.things.get(th)!.def].wall;
}

function boundaryInsulation(game: Game, layer: number, i: number): number {
  const L = game.map.layers[layer];
  if (game.reg.terrain.list[L.terrain[i]].solid) return 1;
  return game.reg.things.list[game.things.get(L.thing[i])!.def].insulation;
}

/** Rebuild all rooms if walls changed since the last build. Keeps temperatures where rooms survive. */
export function ensureRooms(game: Game): void {
  if (game.roomsVersion === game.wallVersion) return;
  const old = game.rooms;
  const fresh = new Map<number, Room>();
  let nextId = 1;
  for (const L of game.map.layers) {
    const { w, h } = L;
    const oldRoom = Int32Array.from(L.room);
    L.room.fill(-1);
    const stack: number[] = [];
    for (let start = 0; start < w * h; start++) {
      if (L.room[start] !== -1 || isBoundary(game, L.index, start)) continue;
      const id = nextId++;
      let size = 0, touchesEdge = false, insSum = 0, insN = 0;
      L.room[start] = id;
      stack.push(start);
      const seenWall = new Set<number>();
      while (stack.length) {
        const i = stack.pop()!;
        size++;
        const x = i % w, y = (i - x) / w;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touchesEdge = true;
        for (const n of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
          if (n < 0 || L.room[n] !== -1) continue;
          if (isBoundary(game, L.index, n)) {
            if (!seenWall.has(n)) {
              seenWall.add(n);
              insSum += boundaryInsulation(game, L.index, n);
              insN++;
            }
            continue;
          }
          L.room[n] = id;
          stack.push(n);
        }
      }
      const outdoor = L.index === 0 && (touchesEdge || size > MAX_ROOM);
      const prev = old.get(oldRoom[start]);
      fresh.set(id, {
        id,
        layer: L.index,
        size,
        outdoor,
        insulation: insN ? insSum / insN : 1,
        temp: prev && !prev.outdoor ? prev.temp : outdoorTemp(game, L.index),
      });
    }
    // Roofs: enclosed surface rooms, and the walls around them. Underground is always roofed.
    for (let i = 0; i < w * h; i++) {
      let roofed: boolean;
      if (L.index > 0) roofed = true;
      else if (L.room[i] !== -1) roofed = !fresh.get(L.room[i])!.outdoor;
      else {
        const x = i % w, y = (i - x) / w;
        roofed = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
          if (!L.inBounds(x + dx, y + dy)) return false;
          const r = L.room[L.i(x + dx, y + dy)];
          return r !== -1 && !fresh.get(r)!.outdoor;
        });
      }
      const v = roofed ? 1 : 0;
      if (L.roof[i] !== v) {
        L.roof[i] = v;
        L.touch(i % w, Math.floor(i / w));
      }
    }
  }
  game.rooms = fresh;
  game.roomsVersion = game.wallVersion;
  game.mapVersion++;
}

export function roomAt(game: Game, layer: number, x: number, y: number): Room | null {
  const L = game.map.layers[layer];
  if (!L.inBounds(x, y)) return null;
  const r = L.room[L.i(x, y)];
  return r === -1 ? null : (game.rooms.get(r) ?? null);
}

/** Temperature where a pawn stands. Walls and doors use the warmer side's room via the caller's tile. */
export function tempAt(game: Game, layer: number, x: number, y: number): number {
  const r = roomAt(game, layer, x, y);
  return r ? r.temp : outdoorTemp(game, layer);
}

export function isRoofed(game: Game, layer: number, x: number, y: number): boolean {
  const L = game.map.layers[layer];
  return L.inBounds(x, y) && L.roof[L.i(x, y)] === 1;
}

/** Move room temperatures toward the outside and add heat from heaters. */
export function tickTemperature(game: Game): void {
  if (game.tick % TEMP_EVERY !== 0) return;
  const dtH = TEMP_EVERY / game.ticksPerHour;
  const heat = new Map<number, number>();
  for (const t of game.things.values()) {
    const d = game.reg.things.list[t.def];
    if (!d.heat) continue;
    const r = game.map.layers[t.layer].room[game.map.layers[t.layer].i(t.x, t.y)];
    if (r !== -1) heat.set(r, (heat.get(r) ?? 0) + d.heat);
  }
  for (const r of game.rooms.values()) {
    const out = outdoorTemp(game, r.layer);
    if (r.outdoor) {
      r.temp = out;
      continue;
    }
    const leak = 0.08 + (1 - r.insulation) * 0.6;
    r.temp += (out - r.temp) * Math.min(1, leak * dtH);
    r.temp += ((heat.get(r.id) ?? 0) * dtH * 16) / Math.max(16, r.size);
    r.temp = Math.max(-40, Math.min(60, r.temp));
  }
}
