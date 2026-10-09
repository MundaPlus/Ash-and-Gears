/**
 * Pathfinding over all layers. 8-way movement, no corner cutting, stairs link layers.
 * Node id = layer * w * h + y * w + x.
 * Reach labels (connected areas) answer "can a pawn get there at all?" fast,
 * so jobs never run a full A* toward an unreachable target.
 */
import type { Game } from "./game.ts";
import { NO_THING } from "./map.ts";

const DIRS: [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];
const STAIRS_COST = 4;

export interface Pos {
  layer: number;
  x: number;
  y: number;
}

/** Binary min-heap of node ids keyed by f-score. */
class Heap {
  ids: number[] = [];
  keys: number[] = [];
  get size() {
    return this.ids.length;
  }
  push(id: number, key: number) {
    const { ids, keys } = this;
    let i = ids.length;
    ids.push(id);
    keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      ids[i] = ids[p]; keys[i] = keys[p];
      i = p;
    }
    ids[i] = id; keys[i] = key;
  }
  pop(): number {
    const { ids, keys } = this;
    const top = ids[0];
    const lastId = ids.pop()!, lastKey = keys.pop()!;
    const n = ids.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < n && keys[l] < lastKey) m = l;
        if (r < n && keys[r] < (m === i ? lastKey : keys[m])) m = r;
        if (m === i) break;
        ids[i] = ids[m]; keys[i] = keys[m];
        i = m;
      }
      ids[i] = lastId; keys[i] = lastKey;
    }
    return top;
  }
}

export class PathFinder {
  private size: number;
  private g: Float32Array;
  private from: Int32Array;
  private stamp: Uint32Array;
  private closed: Uint32Array;
  private gen = 0;
  private reach: Int32Array;
  private reachVersion = -1;
  /** Lowest walk cost of any terrain, keeps the heuristic admissible. */
  private minCost: number;

  constructor(private game: Game) {
    const { w, h, layers } = game.map;
    this.size = w * h * layers.length;
    this.g = new Float32Array(this.size);
    this.from = new Int32Array(this.size);
    this.stamp = new Uint32Array(this.size);
    this.closed = new Uint32Array(this.size);
    this.reach = new Int32Array(this.size);
    this.minCost = Math.min(
      ...game.reg.terrain.list.filter((t) => t.walkCost > 0).map((t) => t.walkCost),
      ...game.reg.floors.list.map((f) => f.walkCost),
    );
  }

  node(p: Pos): number {
    const { w, h } = this.game.map;
    return p.layer * w * h + p.y * w + p.x;
  }

  pos(n: number): Pos {
    const { w, h } = this.game.map;
    const layer = Math.floor(n / (w * h));
    const r = n - layer * w * h;
    return { layer, x: r % w, y: Math.floor(r / w) };
  }

  /** Cost to step onto a tile, or 0 if blocked. */
  private enterCost(layer: number, x: number, y: number): number {
    return this.game.walkCost(layer, x, y);
  }

  /** Layer offset of stairs on this tile, or 0. */
  private stairsAt(layer: number, x: number, y: number): number {
    const L = this.game.map.layers[layer];
    const th = L.thing[L.i(x, y)];
    if (th === NO_THING) return 0;
    return this.game.reg.things.list[this.game.things.get(th)!.def].stairs ?? 0;
  }

  /** Visit neighbors of a node: callback(neighborNode, stepCost). */
  private neighbors(n: number, cb: (m: number, cost: number) => void) {
    const { w, h, layers } = this.game.map;
    const { layer, x, y } = this.pos(n);
    const base = layer * w * h;
    for (const [dx, dy, mul] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const c = this.enterCost(layer, nx, ny);
      if (c === 0) continue;
      // No corner cutting: both side tiles must be open for a diagonal step.
      if (dx !== 0 && dy !== 0 && (this.enterCost(layer, x + dx, y) === 0 || this.enterCost(layer, x, y + dy) === 0)) continue;
      cb(base + ny * w + nx, c * mul);
    }
    const s = this.stairsAt(layer, x, y);
    if (s !== 0) {
      const nl = layer + s;
      if (nl >= 0 && nl < layers.length && this.enterCost(nl, x, y) > 0) cb(nl * w * h + y * w + x, STAIRS_COST);
    }
  }

  /**
   * Recompute connected areas when walkability changed. A tight flood fill over a walkability array
   * (same 8-way rules as pathfinding, no corner cutting), with stairs linking layers.
   */
  private ensureReach() {
    if (this.reachVersion === this.game.pathVersion) return;
    const game = this.game;
    const { w, h, layers } = game.map;
    const wh = w * h;
    const open = new Uint8Array(this.size);
    for (let l = 0; l < layers.length; l++)
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (game.walkCost(l, x, y) > 0) open[l * wh + y * w + x] = 1;
    // Stairs: node -> node on the other layer.
    const link = new Map<number, number>();
    for (const t of game.things.values()) {
      const s = game.reg.things.list[t.def].stairs;
      if (!s) continue;
      const nl = t.layer + s;
      if (nl < 0 || nl >= layers.length) continue;
      const a = t.layer * wh + t.y * w + t.x, b = nl * wh + t.y * w + t.x;
      if (open[a] && open[b]) link.set(a, b);
    }
    const reach = this.reach;
    reach.fill(-1);
    const stack = new Int32Array(this.size);
    let label = 0;
    for (let start = 0; start < this.size; start++) {
      if (!open[start] || reach[start] !== -1) continue;
      let top = 0;
      stack[top++] = start;
      reach[start] = label;
      while (top > 0) {
        const n = stack[--top];
        const base = n - (n % wh);
        const r = n - base;
        const x = r % w, y = (r - x) / w;
        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            if (nx < 0 || nx >= w) continue;
            const m = base + ny * w + nx;
            if (!open[m] || reach[m] !== -1) continue;
            // No corner cutting on diagonals.
            if (dx !== 0 && dy !== 0 && (!open[base + y * w + nx] || !open[base + ny * w + x])) continue;
            reach[m] = label;
            stack[top++] = m;
          }
        }
        const other = link.get(n);
        if (other !== undefined && reach[other] === -1) {
          reach[other] = label;
          stack[top++] = other;
        }
      }
      label++;
    }
    this.reachVersion = game.pathVersion;
  }

  /** True if a pawn standing at `a` can walk to `b` (b itself must be walkable). */
  canReach(a: Pos, b: Pos): boolean {
    this.ensureReach();
    const ra = this.reach[this.node(a)];
    return ra !== -1 && ra === this.reach[this.node(b)];
  }

  /** True if a pawn at `a` can stand next to (or on) tile `b`. For targets like walls and rock. */
  canReachAdjacent(a: Pos, b: Pos): boolean {
    if (this.game.walkable(b.layer, b.x, b.y) && this.canReach(a, b)) return true;
    for (const [dx, dy] of DIRS) {
      const p = { layer: b.layer, x: b.x + dx, y: b.y + dy };
      if (this.game.walkable(p.layer, p.x, p.y) && this.canReach(a, p)) return true;
    }
    return false;
  }

  /**
   * A* from `a` to `b`. With `adjacent`, any tile touching `b` is a goal (for working on walls, rock, plants).
   * Returns the list of positions after `a` (empty if already there), or null if there is no path.
   */
  find(a: Pos, b: Pos, adjacent = false): Pos[] | null {
    if (adjacent ? !this.canReachAdjacent(a, b) : !this.canReach(a, b)) return null;
    const { w, h } = this.game.map;
    const start = this.node(a);
    const isGoal = (n: number) => {
      const p = this.pos(n);
      if (p.layer !== b.layer) return false;
      if (!adjacent) return p.x === b.x && p.y === b.y;
      return Math.abs(p.x - b.x) <= 1 && Math.abs(p.y - b.y) <= 1;
    };
    const hScore = (n: number) => {
      const r = n % (w * h);
      const dx = Math.abs((r % w) - b.x), dy = Math.abs(Math.floor(r / w) - b.y);
      const layerGap = Math.abs(Math.floor(n / (w * h)) - b.layer) * STAIRS_COST;
      return (Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy)) * this.minCost + layerGap;
    };
    this.gen++;
    const open = new Heap();
    this.g[start] = 0;
    this.stamp[start] = this.gen;
    this.from[start] = -1;
    open.push(start, hScore(start));
    while (open.size) {
      const cur = open.pop();
      if (this.closed[cur] === this.gen) continue;
      this.closed[cur] = this.gen;
      if (isGoal(cur)) {
        const out: Pos[] = [];
        for (let n = cur; n !== start; n = this.from[n]) out.push(this.pos(n));
        return out.reverse();
      }
      const gc = this.g[cur];
      this.neighbors(cur, (m, cost) => {
        if (this.closed[m] === this.gen) return;
        const ng = gc + cost;
        if (this.stamp[m] !== this.gen || ng < this.g[m]) {
          this.stamp[m] = this.gen;
          this.g[m] = ng;
          this.from[m] = cur;
          open.push(m, ng + hScore(m));
        }
      });
    }
    return null;
  }
}
