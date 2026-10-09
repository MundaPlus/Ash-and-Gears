/**
 * The game state and the fixed-step tick loop. No DOM. Runs in the browser and in Node.
 */
import type { Content } from "@wc/data";
import { GameMap, NO_THING, type ItemStack, type Thing } from "./map.ts";
import { generateHomeMap } from "./mapgen.ts";
import { PathFinder } from "./path.ts";
import type { Pawn } from "./pawn.ts";
import { Registry } from "./registry.ts";
import { Rng } from "./rng.ts";
import { tickPawns } from "./ai.ts";
import { setupStart } from "./start.ts";

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
}

export const DEFAULT_OPTIONS: GameOptions = {
  seed: "wasteland",
  mapSize: 200,
  layers: 2,
  dayLengthSec: 360,
  seasonDays: 15,
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

  spawnThing(defId: string, layer: number, x: number, y: number): Thing {
    const L = this.map.layers[layer];
    const i = L.i(x, y);
    if (L.thing[i] !== NO_THING) throw new Error(`tile ${layer}:${x},${y} is taken`);
    const def = this.reg.things.idx(defId);
    const t: Thing = { id: this.nextId++, def, layer, x, y, hp: this.reg.things.list[def].hp };
    this.things.set(t.id, t);
    L.thing[i] = t.id;
    L.touch(x, y);
    this.mapVersion++;
    const d = this.reg.things.list[def];
    if (d.blocks || d.stairs) this.pathVersion++;
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
  }

  /** True if a pawn can stand on this tile. */
  walkable(layer: number, x: number, y: number): boolean {
    const L = this.map.layers[layer];
    if (!L.inBounds(x, y)) return false;
    const i = L.i(x, y);
    if (this.reg.terrain.list[L.terrain[i]].walkCost === 0) return false;
    const th = L.thing[i];
    return th === NO_THING || !this.reg.things.list[this.things.get(th)!.def].blocks;
  }

  /** Change the terrain of a tile (mining, clearing). */
  setTerrain(layer: number, x: number, y: number, terrainId: string): void {
    const L = this.map.layers[layer];
    L.terrain[L.i(x, y)] = this.reg.terrain.idx(terrainId);
    L.touch(x, y);
    this.mapVersion++;
    this.pathVersion++;
  }

  /** Advance one fixed sim tick. Systems are added here milestone by milestone. */
  step(): void {
    this.tick++;
    tickPawns(this);
  }
}
