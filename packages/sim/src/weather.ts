/**
 * Weather and the radiation cloud (spec 02 "Weather", spec 04 "Radiation cloud event").
 * A cloud is announced half a day early. While it lasts, survivors under the open sky take a dose.
 * When a cloud or a toxic rain ends, each crop, water source and food or water stack has a chance to
 * stay contaminated (a season for a cloud, half a season for toxic rain). The chance depends on
 * shelter: open sky is worst, a roofed room with a door to outside is low, a sealed room is zero.
 */
import type { Game } from "./game.ts";
import { dropItems } from "./items.ts";
import { addRad } from "./pawn.ts";
import { exposureAt, isRoofed, type Exposure } from "./rooms.ts";

export type WeatherKind = "clear" | "overcast" | "rain" | "toxic_rain" | "rad_cloud";

/** Hours each weather lasts: [min, max]. */
const DURATION: Record<WeatherKind, [number, number]> = { clear: [12, 40], overcast: [6, 20], rain: [3, 10], toxic_rain: [3, 8], rad_cloud: [5, 10] };
const TEMP_OFFSET: Record<WeatherKind, number> = { clear: 0, overcast: -1, rain: -3, toxic_rain: -3, rad_cloud: -2 };
/** Dose per in-game hour under the open sky during a cloud. */
export const CLOUD_DOSE_PER_HOUR = 0.07;
const TOXIC_RAIN_DOSE_PER_HOUR = 0.02;

/** Chance that one crop, water source or stack is contaminated, by shelter. */
export const CONTAM_CHANCE: Record<"rad_cloud" | "toxic_rain", Record<Exposure, number>> = {
  rad_cloud: { open: 0.6, leaky: 0.2, sealed: 0 },
  toxic_rain: { open: 0.3, leaky: 0.08, sealed: 0 },
};

export function contamDuration(game: Game): number {
  return game.opts.seasonDays * game.ticksPerDay;
}

export function isContaminatedThing(game: Game, t: { contamUntil?: number }): boolean {
  return (t.contamUntil ?? 0) > game.tick;
}

/** Announce a radiation cloud that starts after `warnHours`. Used by events and tests. */
export function scheduleRadCloud(game: Game, warnHours = 12): void {
  const at = game.tick + Math.round(warnHours * game.ticksPerHour);
  game.weather.next = { kind: "rad_cloud", at };
  game.weather.lastRadCloud = at;
  game.message("msg.rad_warning", { hours: warnHours }, "bad");
}

function setWeather(game: Game, kind: WeatherKind) {
  const prev = game.weather.kind;
  const [lo, hi] = DURATION[kind];
  game.weather.kind = kind;
  game.weather.until = game.tick + Math.round(game.aiRng.int(lo, hi) * game.ticksPerHour);
  game.weatherTempOffset = TEMP_OFFSET[kind];
  if (kind === "rad_cloud") game.message("msg.rad_cloud_start", {}, "bad");
  if (kind === "toxic_rain") game.message("msg.toxic_rain_start", {}, "bad");
  if ((prev === "rad_cloud" || prev === "toxic_rain") && kind !== prev) contaminate(game, prev);
}

function pickWeather(game: Game): WeatherKind {
  const r = game.aiRng.next();
  // Toxic rain only after the first three days.
  if (r > 0.95 && game.tick > game.ticksPerDay * 3) return "toxic_rain";
  return r < 0.55 ? "clear" : r < 0.8 ? "overcast" : "rain";
}

export function tickWeather(game: Game): void {
  const w = game.weather;
  const tph = Math.round(game.ticksPerHour);
  if (w.next && game.tick >= w.next.at) {
    const k = w.next.kind;
    w.next = null;
    setWeather(game, k);
  } else if (game.tick >= w.until) {
    setWeather(game, pickWeather(game));
  }

  if (game.tick % tph !== 0) return;
  // Hourly effects.
  if (w.kind === "rad_cloud" || w.kind === "toxic_rain") {
    const dose = w.kind === "rad_cloud" ? CLOUD_DOSE_PER_HOUR : TOXIC_RAIN_DOSE_PER_HOUR;
    for (const p of game.pawns.values()) if (p.layer === 0 && !isRoofed(game, 0, p.x, p.y)) addRad(game, p, dose);
  }
  // Toxic ground (glowing pools) gives a small dose to anyone standing on it.
  for (const p of game.pawns.values()) {
    const L = game.map.layers[p.layer];
    const rad = game.reg.terrain.list[L.terrain[L.i(p.x, p.y)]].radiation;
    if (rad > 0) addRad(game, p, rad * 0.02);
    // The body clears radiation slowly: about 0.1 per day.
    p.rad = Math.max(0, p.rad - 0.1 / 24);
  }
  if (w.kind === "rain" || w.kind === "toxic_rain") {
    for (const t of game.things.values()) {
      const def = game.reg.things.list[t.def];
      if (!def.rainCollect) continue;
      const cont = w.kind === "toxic_rain" || isContaminatedThing(game, t);
      dropItems(game, "clean_water", def.rainCollect, t.layer, t.x, t.y, cont, t.contamUntil);
    }
  }
  // Contamination wears off.
  for (const s of game.items.values()) {
    if (s.contaminated && (s.contamUntil ?? 0) <= game.tick) {
      s.contaminated = false;
      delete s.contamUntil;
      const L = game.map.layers[s.layer];
      if (s.layer >= 0) L.touch(s.x, s.y);
    }
  }
}

/** After a cloud or toxic rain: roll contamination for each crop, water source and food or water stack. */
export function contaminate(game: Game, kind: "rad_cloud" | "toxic_rain" = "rad_cloud"): void {
  const until = game.tick + (kind === "rad_cloud" ? contamDuration(game) : Math.round(contamDuration(game) / 2));
  const chance = CONTAM_CHANCE[kind];
  const rng = game.aiRng;
  if (kind === "rad_cloud") {
    // Lakes and puddles are open sky: one roll for all of them.
    if (rng.chance(chance.open)) game.openWaterContamUntil = Math.max(game.openWaterContamUntil, until);
    game.soilContamUntil = Math.max(game.soilContamUntil, until);
  }
  let crops = 0, stacks = 0;
  for (const t of game.things.values()) {
    if (t.layer !== 0) continue;
    const def = game.reg.things.list[t.def];
    if (!def.crop && !def.water && !def.rainCollect) continue;
    if (!rng.chance(chance[exposureAt(game, 0, t.x, t.y)])) continue;
    t.contamUntil = Math.max(t.contamUntil ?? 0, until);
    if (def.crop) crops++;
  }
  for (const s of game.items.values()) {
    if (s.layer !== 0) continue;
    const cat = game.reg.items.list[s.def].category;
    if (cat !== "food" && cat !== "water") continue;
    if (!rng.chance(chance[exposureAt(game, 0, s.x, s.y)])) continue;
    s.contaminated = true;
    s.contamUntil = Math.max(s.contamUntil ?? 0, until);
    game.map.layers[0].touch(s.x, s.y);
    stacks++;
  }
  game.mapVersion++;
  game.message(kind === "rad_cloud" ? "msg.rad_contamination" : "msg.toxic_contamination", { crops, stacks }, "bad");
}
