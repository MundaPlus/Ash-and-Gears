/**
 * The home map: same-size layers stacked vertically.
 * Layer 0 is the surface. Layers 1, 2, ... go down (underground). Tower floors above the surface (N1)
 * come after them in the list. Each layer knows its `level`: 0 surface, -1 and lower underground,
 * +1 and higher above the surface. Stairs link layers by level, never by list position.
 * Per-tile data lives in flat typed arrays (index = y * w + x).
 */

export const NO_THING = -1;
/** Chunk size for change tracking. The renderer uses the same size. */
export const CHUNK = 32;

export interface Thing {
  /** Entity id, unique for the whole game. */
  id: number;
  /** Index into Registry.things. */
  def: number;
  layer: number;
  x: number;
  y: number;
  hp: number;
  /** Crops: growth 0..1. */
  growth?: number;
  /** Radioactive until this tick (crops, wells, rain collectors). */
  contamUntil?: number;
  /** Facing for rotatable things: 0 = east, 1 = south, 2 = west, 3 = north. */
  rot?: number;
  /** Power: true if this consumer has power right now. */
  powered?: boolean;
  /** Generators: fuel units inside. Batteries: stored Wh. */
  fuel?: number;
  charge?: number;
  /** Consumers: charge in the machine's own backup battery (Wh). */
  bank?: number;
  /** Consumers: running on the backup battery right now (the network could not supply it). */
  onBank?: boolean;
  /** Belt cargo moving across this tile. */
  cargo?: { def: number; count: number; progress: number; contaminated?: boolean } | null;
  /** Auto-crafter: chosen recipe, input buffer (item index -> count), work progress. */
  recipe?: string;
  buffer?: Record<number, number>;
  work?: number;
  /** Auto-crafter: finished products waiting to go out (item index -> count). */
  out?: Record<number, number>;
  /** Sorter belts and robot arms: the one item they handle (item index). */
  filter?: number;
  /** Splitter: which output gets the next packet. */
  splitNext?: number;
  /** Bed for prisoners (A6). */
  forPrisoners?: boolean;
  /** Medical bed: only for the sick and hurt. Nobody owns it; it heals faster and tends better. */
  medical?: boolean;
  /** Power switch turned off. */
  off?: boolean;
  /** Benches: up to 5 "make" orders, done in order before stock bills. */
  queue?: { recipe: string; left: number }[];
  /** Graves: a corpse lies here. */
  filled?: boolean;
  /** Consumer priority set by the player (1 keep on longest .. 3 cut first); default from the def. */
  priority?: number;
  /** Pipes, tanks, pumps, taps: liters of each fluid held here ("water", "clean_water"). */
  liquid?: Record<string, number>;
}

/** A stack of one item type lying on a tile or carried by a pawn. */
export interface ItemStack {
  id: number;
  /** Index into Registry.items. */
  def: number;
  count: number;
  /** Position when on the ground. layer = -1 while carried. */
  layer: number;
  x: number;
  y: number;
  /** Radioactive contamination (spec 04). Lasts until contamUntil. */
  contaminated?: boolean;
  contamUntil?: number;
  /** Rot progress 0..1 for food that rots. */
  rot?: number;
  /** Forbidden by the player: survivors leave it alone (belts and arms still move it). */
  forbidden?: boolean;
  /** The player asked to haul this stack now: it goes first on the haul list. */
  haulNow?: boolean;
  /** Inside this chest (thing id). Chest stacks sit at the chest's tile but not in the tile's item slot. */
  chest?: number;
}

/** Player orders on tiles. */
export const Desig = { none: 0, salvage: 1, mine: 2, clear: 3, cut: 4, deconstruct: 5, unfloor: 6, pry: 7, put_down: 8, claim: 9 } as const;
export type DesigKind = Exclude<keyof typeof Desig, "none">;
export const DESIG_KINDS: DesigKind[] = ["salvage", "mine", "clear", "cut", "deconstruct", "unfloor", "pry", "put_down", "claim"];

export interface Blueprint {
  id: number;
  /** "thing" uses Registry.things, "floor" uses Registry.floors. */
  kind: "thing" | "floor";
  def: number;
  layer: number;
  x: number;
  y: number;
  /** Materials still missing: item index -> count. */
  need: Record<number, number>;
  /** Work ticks left once all materials are in. */
  work: number;
  /** Facing for rotatable things. */
  rot?: number;
}

export interface Zone {
  id: number;
  kind: "stockpile" | "grow";
  layer: number;
  /** Allowed item categories (stockpile). */
  allow: string[];
  /** Stockpile: when set, exactly these item ids are taken (per-item filter, N3); categories are then only a summary. */
  allowItems?: string[];
  /** Crop def id (grow zones, M4). */
  crop?: string;
  /** Stockpile priority (B9): 1 low, 2 normal (default), 3 high, 4 critical. Items move up to better stockpiles. */
  priority?: number;
}

export class Layer {
  readonly terrain: Uint8Array;
  /** Entity id of the structure, plant or stairs on this tile, or NO_THING. */
  readonly thing: Int32Array;
  /** Entity id of the item stack lying on this tile, or NO_THING. One stack per tile. */
  readonly item: Int32Array;
  /** Floor index + 1, or 0 for no floor. */
  readonly floor: Uint8Array;
  /** 1 if the tile has a built roof. Underground tiles always count as roofed. */
  readonly roof: Uint8Array;
  /** 1 if the tile needs a roof (enclosed surface room or its walls). Survivors build it. */
  readonly roofWant: Uint8Array;
  /** Room id (see rooms.ts), or -1 for walls and solid rock. */
  readonly room: Int32Array;
  /** Zone id, or NO_THING. */
  readonly zone: Int32Array;
  /** Blueprint id waiting to be built here, or NO_THING. */
  readonly blueprint: Int32Array;
  /** Player order on this tile (Desig enum), 0 = none. */
  readonly desig: Uint8Array;
  /** Change counter per chunk. Bumped by touch(); renderers redraw a chunk when it changes. */
  readonly chunkVersion: Uint32Array;
  readonly chunksX: number;

  constructor(
    readonly index: number,
    readonly w: number,
    readonly h: number,
    /** Height: 0 surface, below 0 underground, above 0 tower floors. */
    readonly level = index ? -index : 0,
  ) {
    this.terrain = new Uint8Array(w * h);
    this.thing = new Int32Array(w * h).fill(NO_THING);
    this.item = new Int32Array(w * h).fill(NO_THING);
    this.floor = new Uint8Array(w * h);
    this.roof = new Uint8Array(w * h);
    this.roofWant = new Uint8Array(w * h);
    this.room = new Int32Array(w * h).fill(-1);
    this.zone = new Int32Array(w * h).fill(NO_THING);
    this.blueprint = new Int32Array(w * h).fill(NO_THING);
    this.desig = new Uint8Array(w * h);
    this.chunksX = Math.ceil(w / CHUNK);
    this.chunkVersion = new Uint32Array(this.chunksX * Math.ceil(h / CHUNK));
  }

  /** Rock above: no sky, no weather, no daylight. */
  get underground(): boolean {
    return this.level < 0;
  }

  /** Mark the chunk of (x, y) as changed. */
  touch(x: number, y: number): void {
    this.chunkVersion[Math.floor(y / CHUNK) * this.chunksX + Math.floor(x / CHUNK)]++;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  i(x: number, y: number): number {
    return y * this.w + x;
  }
}

export class GameMap {
  readonly layers: Layer[];
  private byLevel = new Map<number, number>();

  /** `layerCount` layers from the surface down, then `upper` tower floors above the surface. */
  constructor(
    readonly w: number,
    readonly h: number,
    layerCount: number,
    upper = 0,
  ) {
    this.layers = Array.from({ length: layerCount }, (_, i) => new Layer(i, w, h));
    for (let k = 1; k <= upper; k++) this.layers.push(new Layer(this.layers.length, w, h, k));
    for (const L of this.layers) this.byLevel.set(L.level, L.index);
  }

  /** The layer index at a level, or -1. */
  layerAt(level: number): number {
    return this.byLevel.get(level) ?? -1;
  }

  /** Where stairs lead: `stairs` > 0 goes one level down, < 0 one level up. -1 if there is no such layer. */
  linked(layer: number, stairs: number): number {
    return this.layerAt(this.layers[layer].level - Math.sign(stairs));
  }

  /** The layer one level above or below (-1 if none). */
  above(layer: number): number {
    return this.layerAt(this.layers[layer].level + 1);
  }

  below(layer: number): number {
    return this.layerAt(this.layers[layer].level - 1);
  }
}
