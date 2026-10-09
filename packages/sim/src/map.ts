/**
 * The home map: same-size layers stacked vertically.
 * Layer 0 is the surface. Layer 1 is the first underground layer, and so on.
 * Per-tile data lives in flat typed arrays (index = y * w + x).
 */

export const NO_THING = -1;

export interface Thing {
  /** Entity id, unique for the whole game. */
  id: number;
  /** Index into Registry.things. */
  def: number;
  layer: number;
  x: number;
  y: number;
  hp: number;
}

export class Layer {
  readonly terrain: Uint8Array;
  /** Entity id of the structure, plant or stairs on this tile, or NO_THING. */
  readonly thing: Int32Array;

  constructor(
    readonly index: number,
    readonly w: number,
    readonly h: number,
  ) {
    this.terrain = new Uint8Array(w * h);
    this.thing = new Int32Array(w * h).fill(NO_THING);
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

  constructor(
    readonly w: number,
    readonly h: number,
    layerCount: number,
  ) {
    this.layers = Array.from({ length: layerCount }, (_, i) => new Layer(i, w, h));
  }
}
