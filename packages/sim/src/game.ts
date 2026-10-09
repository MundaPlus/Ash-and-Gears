/**
 * The game state and the fixed-step tick loop. No DOM. Runs in the browser and in Node.
 */
import type { Content } from "@wc/data";
import { GameMap, NO_THING, type Blueprint, type ItemStack, type Thing, type Zone } from "./map.ts";
import { generateHomeMap } from "./mapgen.ts";
import { PathFinder } from "./path.ts";
import type { Pawn } from "./pawn.ts";
import { Registry } from "./registry.ts";
import { Rng } from "./rng.ts";
import { tickPawns } from "./ai.ts";
import { setupStart } from "./start.ts";
import "./systems.ts";
import { ensureRooms, tickTemperature, type Room } from "./rooms.ts";
import { tickWeather, type WeatherKind } from "./weather.ts";
import { tickFarming } from "./farming.ts";
import { tickRot } from "./rot.ts";
import { tickTurrets } from "./combat.ts";
import { tickStoryteller, type StoryState } from "./storyteller.ts";
import { tickFire } from "./fire.ts";
import { tickPower, type PowerNet } from "./power.ts";
import { tickLogistics } from "./logistics.ts";

/** Sim ticks per real second at 1x speed. */
export const TICKS_PER_SECOND = 20;

export interface GameOptions {
  seed: string;
  /** Map width and height in tiles. */
  mapSize: number;
  /** Number of layers including the surface. */
  layers: number;
  /** Real seconds per in-game day at 1x. Spec default: 360. */
  dayLengthSec: number;
  /** In-game days per season. Spec default: 15. */
  seasonDays: number;
  /** Radiation cloud frequency multiplier (storyteller slider). */
  radCloudScale: number;
  /** Storyteller sliders (0..2). */
  raidScale: number;
  mutantScale: number;
  storyteller: "sheriff" | "grandma" | "chaos" | "none";
}

export const DEFAULT_OPTIONS: GameOptions = {
  seed: "wasteland",
  mapSize: 200,
  layers: 2,
  dayLengthSec: 360,
  seasonDays: 15,
  radCloudScale: 1,
  raidScale: 1,
  mutantScale: 1,
  storyteller: "sheriff",
};

export const SEASONS = ["spring", "summer", "autumn", "winter"] as const;

export class Game {
  readonly reg: Registry;
  readonly opts: GameOptions;
  readonly rng: Rng;
  readonly map: GameMap;
  readonly things = new Map<number, Thing>();
  readonly items = new Map<number, ItemStack>();
  readonly pawns = new Map<number, Pawn>();
  readonly blueprints = new Map<number, Blueprint>();
  readonly zones = new Map<number, Zone>();
  /** Node ids (layer * w * h + tile) that carry a player order. */
  readonly desigTiles = new Set<number>();
  rooms = new Map<number, Room>();
  roomsVersion = -1;
  /** Extra degrees from weather. */
  weatherTempOffset = 0;
  weather: { kind: WeatherKind; until: number; next: { kind: WeatherKind; at: number } | null; lastRadCloud: number } = {
    kind: "clear",
    until: 0,
    next: null,
    lastRadCloud: 0,
  };
  /** Open water and outdoor soil stay radioactive until these ticks (spec 04). */
  openWaterContamUntil = 0;
  soilContamUntil = 0;
  /** Pawns that died: for messages, stats and tests. */
  readonly deaths: { id: number; name: string; faction: string; tick: number; cause: string }[] = [];
  /** Visual effects for the renderer (shots, hits). Old entries are dropped. */
  readonly fx: { kind: "shot" | "melee" | "turret"; layer: number; from: { x: number; y: number }; to: { x: number; y: number }; hit: boolean; tick: number }[] = [];
  /** Raids and packs: id -> state. */
  readonly groups = new Map<number, { id: number; kind: string; size: number; fleeing: boolean; arrived: number }>();
  /** Burning tiles: node id -> intensity 0..1. */
  readonly fires = new Map<number, number>();
  readonly story: StoryState = { points: 0, lastThreat: 0, lastGood: 0, log: [] };
  /** Turret cooldowns by thing id. */
  readonly turretCooldown = new Map<number, number>();
  /** Research state (M6 fills in projects). */
  readonly research = { done: new Set<string>(), current: null as string | null, progress: new Map<string, number>() };
  /** Player bill targets: "thingId:recipeId" -> keep this many in stock. */
  readonly billTargets = new Map<string, number>();
  /** Work left per task target, so interrupted work resumes. Key: "task:layer,x,y". */
  readonly progress = new Map<string, number>();
  /** Bumped when walls, doors or solid terrain change. Rooms are rebuilt when it changes. */
  wallVersion = 0;
  /** Bumped when power things or wires change. Power nets are rebuilt when it changes. */
  powerVersion = 0;
  nets: PowerNet[] = [];
  readonly netOf = new Map<number, number>();
  netsVersion = -1;
  /** Job target reservations: key -> pawn id. Keys look like "item:12" or "tile:0,4,5". */
  readonly reservations = new Map<string, number>();
  /** Colony center. Survivors sleep and idle near it until they have beds and rooms. */
  home = { layer: 0, x: 0, y: 0 };
  /** Random stream for pawn decisions. Separate from map generation. */
  readonly aiRng: Rng;
  readonly path: PathFinder;
  tick = 0;
  private nextId = 1;
  /** Bumped on every map change. The renderer uses it to redraw only when needed. */
  mapVersion = 0;
  /** Bumped only when walkability changes. Pathfinding caches use it. */
  pathVersion = 0;
  /** Messages for the player (alerts, events). The client drains this list. */
  readonly messages: { tick: number; key: string; params: Record<string, string | number>; level: "info" | "warn" | "bad" }[] = [];

  constructor(content: Content, opts: Partial<GameOptions> = {}) {
    this.reg = new Registry(content);
    this.opts = { ...DEFAULT_OPTIONS, ...opts };
    this.rng = new Rng(this.opts.seed);
    this.map = new GameMap(this.opts.mapSize, this.opts.mapSize, this.opts.layers);
    this.aiRng = this.rng.fork("ai");
    this.path = new PathFinder(this);
  }

  newId(): number {
    return this.nextId++;
  }

  message(key: string, params: Record<string, string | number> = {}, level: "info" | "warn" | "bad" = "info") {
    this.messages.push({ tick: this.tick, key, params, level });
    if (this.messages.length > 200) this.messages.shift();
  }

  /** Make a new game with a generated home map. */
  static create(content: Content, opts: Partial<GameOptions> = {}): Game {
    const g = new Game(content, opts);
    generateHomeMap(g);
    setupStart(g);
    ensureRooms(g);
    g.weather.until = g.ticksPerDay / 2;
    return g;
  }

  get ticksPerDay(): number {
    return this.opts.dayLengthSec * TICKS_PER_SECOND;
  }

  get ticksPerHour(): number {
    return this.ticksPerDay / 24;
  }

  /** Hour of day as a float 0..24. */
  get hourOfDay(): number {
    return ((this.tick % this.ticksPerDay) / this.ticksPerDay) * 24;
  }

  /** In-game clock derived from the tick count. */
  get time() {
    const dayFloat = this.tick / this.ticksPerDay;
    const day = Math.floor(dayFloat);
    const hourFloat = (dayFloat - day) * 24;
    const seasonIdx = Math.floor(day / this.opts.seasonDays) % 4;
    return {
      day: day + 1,
      hour: Math.floor(hourFloat),
      minute: Math.floor((hourFloat % 1) * 60),
      season: SEASONS[seasonIdx],
      year: Math.floor(day / (this.opts.seasonDays * 4)) + 1,
    };
  }

  spawnThing(defId: string, layer: number, x: number, y: number, rot?: number): Thing {
    const L = this.map.layers[layer];
    const i = L.i(x, y);
    if (L.thing[i] !== NO_THING) throw new Error(`tile ${layer}:${x},${y} is taken`);
    const def = this.reg.things.idx(defId);
    const t: Thing = { id: this.nextId++, def, layer, x, y, hp: this.reg.things.list[def].hp, ...(rot !== undefined ? { rot } : {}) };
    this.things.set(t.id, t);
    L.thing[i] = t.id;
    L.touch(x, y);
    this.mapVersion++;
    const d = this.reg.things.list[def];
    if (d.blocks || d.stairs) this.pathVersion++;
    if (d.wall) this.wallVersion++;
    if (d.power || d.conduit) this.powerVersion++;
    return t;
  }

  removeThing(id: number): void {
    const t = this.things.get(id);
    if (!t) return;
    const L = this.map.layers[t.layer];
    L.thing[L.i(t.x, t.y)] = NO_THING;
    L.touch(t.x, t.y);
    this.things.delete(id);
    this.mapVersion++;
    const d = this.reg.things.list[t.def];
    if (d.blocks || d.stairs) this.pathVersion++;
    if (d.wall) this.wallVersion++;
    if (d.power || d.conduit) this.powerVersion++;
  }

  /** True if a pawn can stand on this tile. */
  walkable(layer: number, x: number, y: number): boolean {
    return this.walkCost(layer, x, y) > 0;
  }

  /** Cost to walk onto a tile, or 0 if it is blocked. Floors replace the terrain cost. */
  walkCost(layer: number, x: number, y: number): number {
    const L = this.map.layers[layer];
    if (!L.inBounds(x, y)) return 0;
    const i = L.i(x, y);
    const td = this.reg.terrain.list[L.terrain[i]];
    if (td.walkCost === 0) return 0;
    const th = L.thing[i];
    if (th !== NO_THING && this.reg.things.list[this.things.get(th)!.def].blocks) return 0;
    const fl = L.floor[i];
    return fl ? this.reg.floors.list[fl - 1].walkCost : td.walkCost;
  }

  /** Def of the thing on a tile, if any. */
  thingDefAt(layer: number, x: number, y: number) {
    const L = this.map.layers[layer];
    const th = L.thing[L.i(x, y)];
    return th === NO_THING ? null : this.reg.things.list[this.things.get(th)!.def];
  }

  /** Change the terrain of a tile (mining, clearing). */
  setTerrain(layer: number, x: number, y: number, terrainId: string): void {
    const L = this.map.layers[layer];
    L.terrain[L.i(x, y)] = this.reg.terrain.idx(terrainId);
    L.touch(x, y);
    this.mapVersion++;
    this.pathVersion++;
    this.wallVersion++;
  }

  /** Advance one fixed sim tick. Systems are added here milestone by milestone. */
  step(): void {
    this.tick++;
    ensureRooms(this);
    tickWeather(this);
    tickTemperature(this);
    tickFarming(this);
    tickRot(this);
    tickStoryteller(this);
    tickFire(this);
    tickPower(this);
    tickLogistics(this);
    tickPawns(this);
    tickTurrets(this);
  }
}
