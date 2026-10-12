/**
 * World map and expeditions (spec 12, Alpha A8). The world is a grid of cells with biomes and
 * scavenging sites around the home colony. An expedition takes survivors and food and water for
 * the trip off the home map, travels to a site, scavenges (loot depends on the site and skill; an
 * ambush may hurt the team), and comes back at the map edge with the loot. An expedition can found
 * an outpost; outposts gather a resource every day, and the next team to visit brings it home.
 */
import type { Game } from "./game.ts";
import { addMemory, learn, skillLevel, traitMult, type Pawn } from "./pawn.ts";
import { damage, isFatal, tickHealthHourly } from "./health.ts";
import { countItems, dropItems, takeFromStack } from "./items.ts";
import { Noise2D } from "./noise.ts";
import { onDeath } from "./social.ts";
import { visitStorySite } from "./plot.ts";
import { NEED_DECAY } from "./pawn.ts";

export const BIOMES = ["wastes", "dead_forest", "ruined_city", "toxic_swamp", "mountains"] as const;
export type Biome = (typeof BIOMES)[number];
/** Travel cost per biome (hours per cell are multiplied by this). */
const BIOME_COST: Record<Biome, number> = { wastes: 1, dead_forest: 1.2, ruined_city: 1.3, toxic_swamp: 1.8, mountains: 2 };
const HOURS_PER_CELL = 4;

export type SiteKind = "ruins" | "bunker" | "wreck_field" | "dead_town" | "crater_rim";
const SITE_KINDS: SiteKind[] = ["ruins", "bunker", "wreck_field", "dead_town", "crater_rim"];
/** Loot per site kind: item -> [min, max] for a full scavenge of a rich site. */
const SITE_LOOT: Record<SiteKind, Record<string, [number, number]>> = {
  ruins: { scrap: [20, 40], components: [1, 4], cloth: [5, 15], canned_food: [3, 10] },
  bunker: { steel: [5, 15], components: [3, 8], electronics: [1, 3], bandage: [2, 6] },
  wreck_field: { scrap: [30, 60], components: [2, 6], steel: [2, 6] },
  dead_town: { canned_food: [5, 15], clean_water: [5, 10], cloth: [10, 20], bandage: [1, 4] },
  crater_rim: { steel: [10, 20], electronics: [2, 5], scrap: [10, 20] },
};
const BASE_DANGER: Record<SiteKind, number> = { ruins: 0.15, bunker: 0.35, wreck_field: 0.2, dead_town: 0.25, crater_rim: 0.45 };
/** Outposts gather this per day. */
const OUTPOST_YIELD: Record<SiteKind, [string, number]> = {
  ruins: ["scrap", 6],
  bunker: ["components", 1],
  wreck_field: ["scrap", 10],
  dead_town: ["cloth", 4],
  crater_rim: ["steel", 2],
};
export const OUTPOST_COST: Record<string, number> = { scrap: 40, wood: 20 };
const SCAVENGE_HOURS = 12;

export interface Site {
  id: number;
  x: number;
  y: number;
  kind: SiteKind;
  /** 0..1: how much is left to find. */
  richness: number;
  /** 0..1: chance-ish of trouble. */
  danger: number;
  outpost?: { since: number; stock: Record<string, number> };
  /** Story location key (Beta): reaching it moves the story on. */
  storyKey?: string;
  /** Story items found on the first visit. */
  storyLoot?: Record<string, number>;
}

export interface WorldMap {
  w: number;
  h: number;
  biome: number[];
  home: { x: number; y: number };
  sites: Site[];
}

export interface Expedition {
  id: number;
  siteId: number;
  /** Pawns on the trip (not on the home map meanwhile). */
  pawns: Pawn[];
  stage: "out" | "work" | "back";
  /** Tick when the current stage ends. */
  until: number;
  /** Food (nutrition) and water (hydration) units carried. */
  food: number;
  water: number;
  loot: Record<string, number>;
  outpost: boolean;
}

/** The world, made on first use from the game seed. */
export function ensureWorld(game: Game): WorldMap {
  if (game.world) return game.world;
  const rng = game.rng.fork("world");
  const w = 32, h = 20;
  const n1 = new Noise2D(rng.fork("b1")), n2 = new Noise2D(rng.fork("b2"));
  const biome: number[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const a = n1.fbm(x, y, 8), b = n2.fbm(x, y, 6);
      const kind: Biome = a > 0.68 ? "mountains" : b > 0.7 ? "toxic_swamp" : a < 0.3 ? "ruined_city" : b < 0.35 ? "dead_forest" : "wastes";
      biome.push(BIOMES.indexOf(kind));
    }
  const home = { x: w >> 1, y: h >> 1 };
  const sites: Site[] = [];
  for (let tries = 0; sites.length < 14 && tries < 500; tries++) {
    const x = rng.int(1, w - 2), y = rng.int(1, h - 2);
    if (Math.hypot(x - home.x, y - home.y) < 2.5 || sites.some((s) => Math.hypot(s.x - x, s.y - y) < 2.5)) continue;
    const kind = rng.pick(SITE_KINDS);
    const far = Math.hypot(x - home.x, y - home.y) / 16;
    sites.push({ id: sites.length + 1, x, y, kind, richness: 0.7 + rng.next() * 0.3, danger: Math.min(0.9, BASE_DANGER[kind] + far * 0.25 + rng.next() * 0.1) });
  }
  game.world = { w, h, biome, home, sites };
  return game.world;
}

export function biomeAt(world: WorldMap, x: number, y: number): Biome {
  return BIOMES[world.biome[y * world.w + x]];
}

/** One-way travel hours from home to a site. */
export function travelHours(game: Game, site: Site): number {
  const world = ensureWorld(game);
  const d = Math.hypot(site.x - world.home.x, site.y - world.home.y);
  const cost = (BIOME_COST[biomeAt(world, site.x, site.y)] + BIOME_COST[biomeAt(world, world.home.x, world.home.y)]) / 2;
  return Math.max(2, Math.round(d * HOURS_PER_CELL * cost));
}

/** Food and water units a team needs for the whole trip, with a day to spare. */
export function suppliesNeeded(game: Game, site: Site, people: number): { food: number; water: number } {
  const days = (2 * travelHours(game, site) + SCAVENGE_HOURS) / 24 + 1;
  return { food: Math.ceil(people * days * NEED_DECAY.hunger * 10) / 10, water: Math.ceil(people * days * NEED_DECAY.thirst * 10) / 10 };
}

/** Units of food or water in stock (clean only), as nutrition or hydration. */
function stockOf(game: Game, kind: "food" | "water"): number {
  let n = 0;
  for (const s of game.items.values()) {
    const d = game.reg.items.list[s.def];
    if (s.layer < 0 || s.contaminated || d.category !== kind) continue;
    n += s.count * (kind === "food" ? d.nutrition : d.hydration);
  }
  return n;
}

function takeSupplies(game: Game, kind: "food" | "water", units: number): number {
  const stacks = [...game.items.values()]
    .filter((s) => s.layer >= 0 && !s.contaminated && game.reg.items.list[s.def].category === kind)
    .sort((a, b) => valueOf(game, b, kind) - valueOf(game, a, kind));
  let got = 0;
  for (const s of stacks) {
    const per = valueOf(game, s, kind);
    if (per <= 0) continue;
    while (got < units && game.items.has(s.id)) got += takeFromStack(game, s.id, 1) * per;
    if (got >= units) break;
  }
  return got;
}

const valueOf = (game: Game, s: { def: number }, kind: "food" | "water") => {
  const d = game.reg.items.list[s.def];
  return kind === "food" ? d.nutrition : d.hydration;
};

export type LaunchProblem = "no_people" | "not_free" | "no_food" | "no_water" | "no_outpost_materials" | null;

/** Why a team cannot go, or null if it can. */
export function canLaunch(game: Game, site: Site, pawns: Pawn[], outpost: boolean): LaunchProblem {
  if (!pawns.length) return "no_people";
  if (pawns.some((p) => p.faction !== "colony" || p.robot || p.health.downed || p.drafted || !game.pawns.has(p.id))) return "not_free";
  const need = suppliesNeeded(game, site, pawns.length);
  if (stockOf(game, "food") < need.food) return "no_food";
  if (stockOf(game, "water") < need.water) return "no_water";
  if (outpost && !site.outpost && Object.entries(OUTPOST_COST).some(([item, n]) => countItems(game, item) < n)) return "no_outpost_materials";
  return null;
}

/** Send a team. Takes them off the map with supplies. Returns the expedition or null. */
export function launchExpedition(game: Game, siteId: number, pawnIds: number[], outpost = false): Expedition | null {
  const world = ensureWorld(game);
  const site = world.sites.find((s) => s.id === siteId);
  const pawns = pawnIds.map((id) => game.pawns.get(id)).filter((p): p is Pawn => !!p);
  if (!site || pawns.length !== pawnIds.length || canLaunch(game, site, pawns, outpost)) return null;
  const need = suppliesNeeded(game, site, pawns.length);
  const food = takeSupplies(game, "food", need.food);
  const water = takeSupplies(game, "water", need.water);
  if (outpost && !site.outpost)
    for (const [item, n] of Object.entries(OUTPOST_COST)) {
      let left = n;
      for (const s of [...game.items.values()].filter((x) => x.layer >= 0 && game.reg.items.list[x.def].id === item)) {
        if (left <= 0) break;
        left -= takeFromStack(game, s.id, left);
      }
    }
  for (const p of pawns) {
    for (const [k, v] of game.reservations) if (v === p.id) game.reservations.delete(k);
    if (p.carrying) dropItems(game, p.carrying.def, p.carrying.count, p.layer, p.x, p.y, !!p.carrying.contaminated, p.carrying.contamUntil, p.carrying.rot);
    p.carrying = null;
    p.job = null;
    p.path = null;
    p.goal = null;
    p.bedId = null;
    game.pawns.delete(p.id);
  }
  const exp: Expedition = { id: game.newId(), siteId, pawns, stage: "out", until: game.tick + travelHours(game, site) * game.ticksPerHour, food, water, loot: {}, outpost: outpost && !site.outpost };
  game.expeditions.push(exp);
  game.message("msg.expedition_left", { n: pawns.length, site: siteName(site) }, "info");
  return exp;
}

/** Once per in-game hour: travel, scavenging, needs and health of teams; outposts gather. */
export function tickWorld(game: Game): void {
  if (game.tick % Math.round(game.ticksPerHour) !== 0) return;
  const world = game.world;
  if (!world) return;
  if (game.tick % game.ticksPerDay === 0)
    for (const s of world.sites)
      if (s.outpost) {
        const [item, n] = OUTPOST_YIELD[s.kind];
        s.outpost.stock[item] = Math.min(200, (s.outpost.stock[item] ?? 0) + n);
      }
  for (const exp of [...game.expeditions]) tickExpedition(game, world, exp);
}

function tickExpedition(game: Game, world: WorldMap, exp: Expedition) {
  const site = world.sites.find((s) => s.id === exp.siteId)!;
  // Needs on the road: eat and drink from the packs when below half.
  for (const p of [...exp.pawns]) {
    p.needs.hunger = Math.max(0, p.needs.hunger - (NEED_DECAY.hunger / 24) * traitMult(game, p, (t) => t.needMult.hunger));
    p.needs.thirst = Math.max(0, p.needs.thirst - (NEED_DECAY.thirst / 24) * traitMult(game, p, (t) => t.needMult.thirst));
    p.needs.rest = 1;
    if (p.needs.hunger < 0.5 && exp.food > 0) {
      const eat = Math.min(exp.food, 1 - p.needs.hunger);
      exp.food -= eat;
      p.needs.hunger += eat;
    }
    if (p.needs.thirst < 0.5 && exp.water > 0) {
      const drink = Math.min(exp.water, 1 - p.needs.thirst);
      exp.water -= drink;
      p.needs.thirst += drink;
    }
    tickHealthHourly(game, p, false);
    if (isFatal(game, p)) die(game, exp, p);
  }
  if (!exp.pawns.length) {
    game.expeditions.splice(game.expeditions.indexOf(exp), 1);
    game.message("msg.expedition_lost", { site: siteName(site) }, "bad");
    return;
  }
  if (exp.stage === "work") scavengeHour(game, exp, site);
  if (game.tick < exp.until) return;
  if (exp.stage === "out") {
    exp.stage = "work";
    exp.until = game.tick + SCAVENGE_HOURS * game.ticksPerHour;
    if (exp.outpost) {
      site.outpost = { since: game.tick, stock: {} };
      game.message("msg.outpost_founded", { site: siteName(site) }, "info");
    }
    // An outpost's stock goes into the packs.
    if (site.outpost) for (const [item, n] of Object.entries(site.outpost.stock)) exp.loot[item] = (exp.loot[item] ?? 0) + n;
    if (site.outpost) site.outpost.stock = {};
    // A story location: its story items come first, and the story hears about the visit.
    if (site.storyKey) {
      for (const [item, n] of Object.entries(site.storyLoot ?? {})) exp.loot[item] = (exp.loot[item] ?? 0) + n;
      site.storyLoot = {};
      visitStorySite(game, site.storyKey);
    }
    game.message("msg.expedition_arrived", { site: siteName(site) }, "info");
  } else if (exp.stage === "work") {
    exp.stage = "back";
    exp.until = game.tick + travelHours(game, site) * game.ticksPerHour;
  } else returnHome(game, exp, site);
}

function scavengeHour(game: Game, exp: Expedition, site: Site) {
  const rng = game.aiRng;
  const skill = exp.pawns.reduce((a, p) => a + skillLevel(game, p, "scavenging"), 0) / exp.pawns.length;
  for (const [item, [lo, hi]] of Object.entries(SITE_LOOT[site.kind])) {
    // Share of a full scavenge found this hour, by richness and skill.
    const share = (site.richness * (0.6 + skill / 25) * exp.pawns.length ** 0.5) / SCAVENGE_HOURS;
    const n = Math.floor((lo + rng.next() * (hi - lo)) * share + rng.next());
    if (n > 0) exp.loot[item] = (exp.loot[item] ?? 0) + n;
  }
  site.richness = Math.max(0.05, site.richness * 0.97);
  for (const p of exp.pawns) learn(game, p, "scavenging", 3);
  // Trouble: fighters take less harm.
  if (rng.chance(site.danger * 0.04)) {
    game.message("msg.expedition_ambush", { site: siteName(site) }, "bad");
    for (const p of exp.pawns) {
      const fight = Math.max(skillLevel(game, p, "shooting"), skillLevel(game, p, "melee"));
      const hits = rng.int(0, 2);
      for (let i = 0; i < hits; i++) if (rng.chance(1 - fight / 25)) damage(game, p, 6 + rng.int(0, 8), rng.chance(0.5) ? "gunshot" : "cut");
      learn(game, p, fight === skillLevel(game, p, "shooting") ? "shooting" : "melee", 20);
      // A medic in the team patches everyone up.
      if (exp.pawns.some((o) => skillLevel(game, o, "medicine") >= 3)) for (const inj of p.health.injuries) inj.tended = Math.max(inj.tended, 0.5);
      if (isFatal(game, p)) die(game, exp, p);
    }
  }
}

function die(game: Game, exp: Expedition, p: Pawn) {
  exp.pawns.splice(exp.pawns.indexOf(p), 1);
  game.message("msg.died_away", { name: p.nick }, "bad");
  for (const o of game.pawns.values()) if (o.faction === "colony" && !o.robot) addMemory(game, o, "colonist_died");
  onDeath(game, p);
  game.deaths.push({ id: p.id, name: p.nick, faction: p.faction, tick: game.tick, cause: "expedition" });
}

/** The team walks in at the home map edge nearest the site and drops its loot there. */
function returnHome(game: Game, exp: Expedition, site: Site) {
  const world = ensureWorld(game);
  const L = game.map.layers[0];
  const dx = site.x - world.home.x, dy = site.y - world.home.y;
  // Entry on the side the site lies on; then search inward for open ground.
  let ex = Math.round((L.w - 1) / 2 + (Math.abs(dx) >= Math.abs(dy) ? Math.sign(dx) * (L.w / 2 - 2) : 0));
  let ey = Math.round((L.h - 1) / 2 + (Math.abs(dy) > Math.abs(dx) ? Math.sign(dy) * (L.h / 2 - 2) : 0));
  for (let k = 0; k < 60 && !game.walkable(0, ex, ey); k++) {
    ex += Math.sign(game.home.x - ex);
    ey += Math.sign(game.home.y - ey);
  }
  exp.pawns.forEach((p, i) => {
    p.layer = 0;
    p.x = Math.max(0, Math.min(L.w - 1, ex + (i % 3) - 1));
    p.y = Math.max(0, Math.min(L.h - 1, ey + Math.floor(i / 3)));
    if (!game.walkable(0, p.x, p.y)) {
      p.x = ex;
      p.y = ey;
    }
    p.moveT = 0;
    p.thinkCooldown = 0;
    game.pawns.set(p.id, p);
  });
  // Leftover supplies come back as cans and water jugs.
  const loot = { ...exp.loot };
  if (exp.food >= 0.45) loot.canned_food = (loot.canned_food ?? 0) + Math.floor(exp.food / 0.45);
  for (const [item, n] of Object.entries(loot)) if (n > 0 && game.reg.items.has(item)) dropItems(game, item, n, 0, ex, ey);
  game.expeditions.splice(game.expeditions.indexOf(exp), 1);
  const total = Object.values(exp.loot).reduce((a, b) => a + b, 0);
  game.message("msg.expedition_back", { n: exp.pawns.length, items: total }, "info");
}

/** A site's name for messages: its story name, or its kind. */
function siteName(site: Site): string {
  return site.storyKey ? `story.site.${site.storyKey}` : site.kind;
}
