/**
 * Player tools: build, orders, cancel and zones. Drag shapes:
 * walls make a line or a rectangle outline, floors / orders / zones fill a rectangle,
 * other buildings make a line.
 */
import { Container, Graphics } from "pixi.js";
import {
  addToZone,
  canDesignate,
  canPlace,
  cancelBlueprint,
  createZone,
  designate,
  NO_THING,
  placeBlueprint,
  removeZoneTiles,
  undesignate,
  type DesigKind,
  type Game,
} from "@wc/sim";
import { TILE } from "../render/textures.ts";
import type { ToolHandler } from "./camera.ts";

export type ToolSpec =
  | { kind: "build"; defKind: "thing" | "floor"; def: string }
  | { kind: "order"; desig: DesigKind }
  | { kind: "cancel" }
  | { kind: "zone"; zone: "stockpile" | "remove" }
  | { kind: "zone"; zone: "grow"; crop: string };

interface Tile {
  x: number;
  y: number;
}

export class ToolController implements ToolHandler {
  readonly preview = new Graphics();
  spec: ToolSpec | null = null;
  layer = 0;
  private start: Tile | null = null;
  private end: Tile | null = null;
  onApplied: () => void = () => {};

  constructor(
    private game: Game,
    parent: Container,
  ) {
    parent.addChild(this.preview);
  }

  set(spec: ToolSpec | null) {
    this.spec = spec;
    this.cancel();
  }

  private tileAt(wx: number, wy: number): Tile {
    return { x: Math.floor(wx / TILE), y: Math.floor(wy / TILE) };
  }

  down(wx: number, wy: number) {
    this.start = this.end = this.tileAt(wx, wy);
    this.draw();
  }

  move(wx: number, wy: number) {
    if (!this.start) return;
    const t = this.tileAt(wx, wy);
    if (this.end && t.x === this.end.x && t.y === this.end.y) return;
    this.end = t;
    this.draw();
  }

  up(wx: number, wy: number) {
    if (!this.start || !this.spec) return this.cancel();
    this.end = this.tileAt(wx, wy);
    this.apply(this.tiles());
    this.cancel();
    this.onApplied();
  }

  cancel() {
    this.start = this.end = null;
    this.preview.clear();
  }

  /** Tiles covered by the current drag, by tool shape. */
  tiles(): Tile[] {
    const a = this.start!, b = this.end!;
    const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
    const out: Tile[] = [];
    const spec = this.spec!;
    const isWall = spec.kind === "build" && spec.defKind === "thing" && this.game.reg.things.get(spec.def).wall;
    const fill = spec.kind !== "build" || spec.defKind === "floor";
    if (fill) {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push({ x, y });
    } else if (isWall && x1 > x0 && y1 > y0) {
      for (let x = x0; x <= x1; x++) out.push({ x, y: y0 }, { x, y: y1 });
      for (let y = y0 + 1; y < y1; y++) out.push({ x: x0, y }, { x: x1, y });
    } else if (x1 - x0 >= y1 - y0) {
      for (let x = x0; x <= x1; x++) out.push({ x, y: a.y });
    } else {
      for (let y = y0; y <= y1; y++) out.push({ x: a.x, y });
    }
    return out;
  }

  private valid(t: Tile): boolean {
    const g = this.game, s = this.spec!, l = this.layer;
    const L = g.map.layers[l];
    if (!L.inBounds(t.x, t.y)) return false;
    const i = L.i(t.x, t.y);
    switch (s.kind) {
      case "build":
        return canPlace(g, s.defKind, s.def, l, t.x, t.y);
      case "order":
        return canDesignate(g, s.desig, l, t.x, t.y);
      case "cancel":
        return L.blueprint[i] !== NO_THING || L.desig[i] !== 0;
      case "zone":
        if (s.zone === "remove") return L.zone[i] !== NO_THING;
        if (s.zone === "grow") return L.zone[i] === NO_THING && L.floor[i] === 0 && g.reg.terrain.list[L.terrain[i]].fertility > 0;
        return L.zone[i] === NO_THING && !g.reg.terrain.list[L.terrain[i]].solid;
    }
  }

  private draw() {
    this.preview.clear();
    if (!this.start || !this.spec) return;
    for (const t of this.tiles()) {
      const ok = this.valid(t);
      this.preview
        .rect(t.x * TILE + 1, t.y * TILE + 1, TILE - 2, TILE - 2)
        .fill({ color: ok ? 0x9fd14a : 0xc2453a, alpha: 0.25 })
        .stroke({ width: 1, color: ok ? 0x9fd14a : 0xc2453a, alpha: 0.8 });
    }
  }

  private apply(tiles: Tile[]) {
    const g = this.game, s = this.spec!, l = this.layer;
    const L = g.map.layers[l];
    switch (s.kind) {
      case "build":
        for (const t of tiles) placeBlueprint(g, s.defKind, s.def, l, t.x, t.y);
        break;
      case "order":
        for (const t of tiles) designate(g, s.desig, l, t.x, t.y);
        break;
      case "cancel":
        for (const t of tiles) {
          if (!L.inBounds(t.x, t.y)) continue;
          const bp = L.blueprint[L.i(t.x, t.y)];
          if (bp !== NO_THING) cancelBlueprint(g, bp);
          undesignate(g, l, t.x, t.y);
        }
        break;
      case "zone": {
        if (s.zone === "remove") {
          removeZoneTiles(g, l, tiles);
          break;
        }
        // Extend a matching zone next to the drag, or make a new one.
        const crop = s.zone === "grow" ? s.crop : undefined;
        const near = tiles
          .flatMap((t) => [[t.x + 1, t.y], [t.x - 1, t.y], [t.x, t.y + 1], [t.x, t.y - 1]])
          .map(([x, y]) => (L.inBounds(x, y) ? L.zone[L.i(x, y)] : NO_THING))
          .find((z) => {
            const zz = z !== NO_THING ? g.zones.get(z) : undefined;
            return !!zz && zz.kind === s.zone && zz.crop === crop;
          });
        if (near !== undefined) addToZone(g, near, tiles);
        else createZone(g, s.zone, l, tiles, undefined, crop);
        break;
      }
    }
  }
}
