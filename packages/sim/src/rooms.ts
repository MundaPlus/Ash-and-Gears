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
  // Rebuild only layers whose walls changed (all layers on the first build).
  const first = game.roomsVersion === -1 || game.wallDirty.size === 0;
  const dirty = first ? new Set(game.map.layers.map((L) => L.index)) : new Set(game.wallDirty);
  const fresh = new Map<number, Room>();
  for (const r of old.values()) if (!dirty.has(r.layer)) fresh.set(r.id, r);
  let nextId = Math.max(0, ...old.keys()) + 1;
  for (const L of game.map.layers) {
    if (!dirty.has(L.index)) continue;
    const { w, h } = L;
    const n = w * h;
    const oldRoom = Int32Array.from(L.room);
    L.room.fill(-1);
    // Boundary insulation per tile, or -1 for open ground.
    const wallIns = new Float32Array(n).fill(-1);
    for (let i = 0; i < n; i++) if (isBoundary(game, L.index, i)) wallIns[i] = boundaryInsulation(game, L.index, i);
    const stack = new Int32Array(n);
    /** Which room last counted this wall tile, so each wall counts once per room. */
    const wallSeen = new Int32Array(n).fill(-1);
    for (let start = 0; start < n; start++) {
      if (L.room[start] !== -1 || wallIns[start] >= 0) continue;
      const id = nextId++;
      let size = 0, touchesEdge = false, insSum = 0, insN = 0, top = 0;
      L.room[start] = id;
      stack[top++] = start;
      while (top > 0) {
        const i = stack[--top];
        size++;
        const x = i % w, y = (i - x) / w;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touchesEdge = true;
        for (let k = 0; k < 4; k++) {
          const nb = k === 0 ? (x > 0 ? i - 1 : -1) : k === 1 ? (x < w - 1 ? i + 1 : -1) : k === 2 ? (y > 0 ? i - w : -1) : y < h - 1 ? i + w : -1;
          if (nb < 0 || L.room[nb] !== -1) continue;
          if (wallIns[nb] >= 0) {
            if (wallSeen[nb] !== id) {
              wallSeen[nb] = id;
              insSum += wallIns[nb];
              insN++;
            }
            continue;
          }
          L.room[nb] = id;
          stack[top++] = nb;
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
    const enclosed = (r: number) => r !== -1 && !fresh.get(r)!.outdoor;
    for (let i = 0; i < n; i++) {
      let roofed: boolean;
      if (L.index > 0) roofed = true;
      else if (L.room[i] !== -1) roofed = enclosed(L.room[i]);
      else {
        const x = i % w;
        roofed = (x > 0 && enclosed(L.room[i - 1])) || (x < w - 1 && enclosed(L.room[i + 1])) || (i >= w && enclosed(L.room[i - w])) || (i + w < n && enclosed(L.room[i + w]));
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
  game.wallDirty.clear();
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
