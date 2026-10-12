/**
 * Rooms, roofs and temperature (spec 03, "Rooms" and "Temperature").
 * A room is a 4-connected area bounded by walls, doors or solid rock.
 * On the surface, an area that touches the map edge (or is huge) is "outdoors".
 * Enclosed surface rooms need a roof. Survivors build it tile by tile (construction work).
 * Underground counts as roofed everywhere. Above ground, a floor on the level above also roofs a tile
 * (tower floors, N1); the top floor of a tower is open to the sky.
 * A room is "sealed" when no door opens straight to the outside. Two doors in a row
 * (an airlock) or a door into a closed hall keep radiation out.
 */
import type { Game } from "./game.ts";
import { NO_THING, type Thing } from "./map.ts";

export interface Room {
  id: number;
  layer: number;
  size: number;
  outdoor: boolean;
  /** Average insulation of the room's boundary (walls, doors, rock). */
  insulation: number;
  /** Degrees Celsius. */
  temp: number;
  /** No door of this room opens straight to outdoors. */
  sealed: boolean;
}

/** Bigger enclosed areas count as outdoors (no roof). */
export const MAX_ROOM = 900;
const TEMP_EVERY = 60;
const UNDERGROUND_TEMP = 13;
/** Comfortable temperature range without clothes. Clothes widen it to the cold side (see gear.ts). */
export const COMFORT_MIN = 12;
export const COMFORT_MAX = 28;
export const SEASON_BASE = [12, 24, 10, -4];
/** Outdoor temperature swing over the day: this much above and below the season base. */
export const DAILY_SWING = 6;

export function outdoorTemp(game: Game, layer: number): number {
  const lv = game.map.layers[layer].level;
  // Deeper is a little colder; tower floors share the surface weather.
  if (lv < 0) return UNDERGROUND_TEMP - (-lv - 1) * 2;
  const season = Math.floor((game.tick / game.ticksPerDay) / game.opts.seasonDays) % 4;
  const daily = DAILY_SWING * Math.sin(((game.hourOfDay - 9) * Math.PI) / 12);
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
      const outdoor = !L.underground && (touchesEdge || size > MAX_ROOM);
      const prev = old.get(oldRoom[start]);
      fresh.set(id, {
        id,
        layer: L.index,
        size,
        outdoor,
        insulation: insN ? insSum / insN : 1,
        temp: prev && !prev.outdoor ? prev.temp : outdoorTemp(game, L.index),
        sealed: !outdoor,
      });
    }
    // A door unseals the enclosed rooms it touches when it opens straight to outdoors, or when
    // it leads into a second door that is not set between walls (a real airlock has walls at its sides).
    const isDoor = (i: number) => L.thing[i] !== NO_THING && game.reg.things.list[game.things.get(L.thing[i])!.def].door;
    const isSolidWall = (i: number) => i >= 0 && isBoundary(game, L.index, i) && !isDoor(i);
    const step = (i: number, k: number) => {
      const x = i % w;
      return k === 0 ? (x > 0 ? i - 1 : -1) : k === 1 ? (x < w - 1 ? i + 1 : -1) : k === 2 ? (i >= w ? i - w : -1) : i + w < n ? i + w : -1;
    };
    for (let i = 0; i < n; i++) {
      if (!isDoor(i)) continue;
      const rooms: Room[] = [];
      let leak = false;
      for (let k = 0; k < 4; k++) {
        const nb = step(i, k);
        if (nb < 0) continue;
        if (L.room[nb] !== -1) {
          const r = fresh.get(L.room[nb])!;
          if (r.outdoor) leak = true;
          else rooms.push(r);
        } else if (isDoor(nb)) {
          // Second door: its two sides across the passage must be walls.
          const sides = k < 2 ? [step(nb, 2), step(nb, 3)] : [step(nb, 0), step(nb, 1)];
          if (!sides.every(isSolidWall)) leak = true;
        }
      }
      if (leak) for (const r of rooms) r.sealed = false;
    }
    // Roofs: enclosed surface rooms and the walls around them need one. Underground is always roofed.
    const enclosed = (r: number) => r !== -1 && !fresh.get(r)!.outdoor;
    for (let i = 0; i < n; i++) {
      let want: boolean;
      if (L.underground) want = true;
      else if (L.level > 0 || coveredAbove(game, L.index, i % w, Math.floor(i / w))) want = false;
      else if (L.room[i] !== -1) want = enclosed(L.room[i]);
      else {
        const x = i % w;
        want = (x > 0 && enclosed(L.room[i - 1])) || (x < w - 1 && enclosed(L.room[i + 1])) || (i >= w && enclosed(L.room[i - w])) || (i + w < n && enclosed(L.room[i + w]));
      }
      L.roofWant[i] = want ? 1 : 0;
      if (L.underground) {
        if (!L.roof[i]) L.roof[i] = 1;
        continue;
      }
      // Tower floors get no built roofs (the floor above covers them, see isRoofed).
      if (L.level > 0) continue;
      // A roof falls in when its room opens up.
      if (!want && L.roof[i]) {
        L.roof[i] = 0;
        L.touch(i % w, Math.floor(i / w));
      }
      if (want && !L.roof[i]) game.roofTodo.add(i);
      else game.roofTodo.delete(i);
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

/** Build the roof on one surface tile (the "roof" work task calls this). */
export function setRoof(game: Game, x: number, y: number, on: boolean): void {
  const L = game.map.layers[0];
  const i = L.i(x, y);
  L.roof[i] = on ? 1 : 0;
  if (on || !L.roofWant[i]) game.roofTodo.delete(i);
  else game.roofTodo.add(i);
  L.touch(x, y);
  game.mapVersion++;
}

/** Give every enclosed room its roof at once (map generation, showcase, old saves). */
export function completeRoofs(game: Game): void {
  ensureRooms(game);
  const L = game.map.layers[0];
  for (const i of game.roofTodo) {
    L.roof[i] = 1;
    L.touch(i % L.w, Math.floor(i / L.w));
  }
  game.roofTodo.clear();
  game.mapVersion++;
}

/**
 * How much radiation and toxic rain reach a tile.
 * "open": no roof. "leaky": roofed, but a door opens to the outside. "sealed": safe.
 */
export type Exposure = "open" | "leaky" | "sealed";

export function exposureAt(game: Game, layer: number, x: number, y: number): Exposure {
  const L = game.map.layers[layer];
  if (L.underground) return "sealed";
  const i = L.i(x, y);
  if (!isRoofed(game, layer, x, y)) return "open";
  const r = game.rooms.get(L.room[i]);
  if (!r || r.outdoor || !r.sealed) return "leaky";
  return layer !== 0 || roomFullyRoofed(game, r) ? "sealed" : "leaky";
}

/** True if no tile of the room still waits for its roof. */
function roomFullyRoofed(game: Game, r: Room): boolean {
  const L = game.map.layers[r.layer];
  for (const i of game.roofTodo) if (L.room[i] === r.id) return false;
  return true;
}

export function isRoofed(game: Game, layer: number, x: number, y: number): boolean {
  const L = game.map.layers[layer];
  return L.inBounds(x, y) && (L.roof[L.i(x, y)] === 1 || coveredAbove(game, layer, x, y));
}

/** A floor on the level above (a tower floor) covers this tile. */
export function coveredAbove(game: Game, layer: number, x: number, y: number): boolean {
  const up = game.map.above(layer);
  if (up < 0 || !game.reg.terrain.has("open_air")) return false;
  const U = game.map.layers[up];
  return U.inBounds(x, y) && U.terrain[U.i(x, y)] !== game.reg.terrain.idx("open_air");
}

/** The temperature a heater or cooler aims for. */
export function thermostatTarget(game: Game, t: Thing): number {
  return t.target ?? game.reg.things.list[t.def].thermostat?.target ?? 21;
}

/** Air flow through one vent per hour: share of the gap between the two sides that closes. */
const VENT_FLOW = 0.6;

/**
 * Move room temperatures toward the outside, add heat from fires and machines, let vents mix the air
 * of neighbor rooms, and run heaters and coolers only as hard as needed to hold their target.
 */
export function tickTemperature(game: Game): void {
  if (game.tick % TEMP_EVERY !== 0) return;
  const dtH = TEMP_EVERY / game.ticksPerHour;
  const heat = new Map<number, number>();
  const climate = new Map<number, Thing[]>();
  const vents: Thing[] = [];
  for (const t of game.things.values()) {
    const d = game.reg.things.list[t.def];
    if (d.vent) vents.push(t);
    if (!d.heat) continue;
    // No fuel, no heat: fires and generators. No power: machines.
    if ((d.burns && !(t.fuel ?? 0)) || (d.power?.fuel && !(t.fuel ?? 0)) || (d.power?.use && !t.powered)) {
      if (d.thermostat) t.duty = 0;
      continue;
    }
    const L = game.map.layers[t.layer];
    const r = L.room[L.i(t.x, t.y)];
    if (d.thermostat) {
      // Outdoors there is no room to hold: it runs flat out and changes nothing.
      const room = r === -1 ? undefined : game.rooms.get(r);
      if (!room || room.outdoor) t.duty = 1;
      else climate.set(r, [...(climate.get(r) ?? []), t]);
    } else if (r !== -1) heat.set(r, (heat.get(r) ?? 0) + d.heat);
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
  }
  // Vents: the air of the two rooms on either side mixes (the bigger room changes less).
  for (const v of vents) {
    const L = game.map.layers[v.layer];
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      // Only across the wall: the two tiles along the wall line are walls too.
      if (!L.inBounds(v.x - dx, v.y - dy) || !L.inBounds(v.x + dx, v.y + dy)) continue;
      if (isBoundary(game, v.layer, L.i(v.x - dx, v.y - dy)) || isBoundary(game, v.layer, L.i(v.x + dx, v.y + dy))) continue;
      const a = roomAt(game, v.layer, v.x - dx, v.y - dy), b = roomAt(game, v.layer, v.x + dx, v.y + dy);
      if (a && a === b) continue;
      const ta = a ? a.temp : outdoorTemp(game, v.layer), tb = b ? b.temp : outdoorTemp(game, v.layer);
      // Outdoor air (no room or an outdoor room) does not change: it is as big as the world.
      const sa = !a || a.outdoor ? Infinity : a.size, sb = !b || b.outdoor ? Infinity : b.size;
      if (sa === Infinity && sb === Infinity) continue;
      const share = Math.min(1, VENT_FLOW * dtH);
      const moved = (ta - tb) * share * (sa === Infinity ? sb : sb === Infinity ? sa : (sa * sb) / (sa + sb));
      if (a && sa !== Infinity) a.temp -= moved / sa;
      if (b && sb !== Infinity) b.temp += moved / sb;
    }
  }
  // Heaters and coolers last: they see what the room would be without them and fill the gap.
  for (const [rid, list] of climate) {
    const r = game.rooms.get(rid)!;
    for (const t of list) {
      const d = game.reg.things.list[t.def];
      const full = (Math.abs(d.heat) * dtH * 16) / Math.max(16, r.size);
      const gap = d.heat > 0 ? thermostatTarget(game, t) - r.temp : r.temp - thermostatTarget(game, t);
      const used = Math.max(0, Math.min(full, gap));
      r.temp += d.heat > 0 ? used : -used;
      t.duty = full > 0 ? used / full : 0;
    }
  }
  for (const r of game.rooms.values()) r.temp = Math.max(-40, Math.min(60, r.temp));
}
