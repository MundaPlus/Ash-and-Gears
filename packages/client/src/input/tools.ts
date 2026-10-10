/**
 * Player tools: build, orders, cancel and zones. Drag shapes:
 * walls make a line or a rectangle outline, floors / orders / zones fill a rectangle,
 * other buildings make a line.
 */
import { Container, Graphics, Sprite, type Texture } from "pixi.js";
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
  /** The building as a see-through ghost under the cursor (build tool). */
  private ghosts = new Container();
  /** Texture for a thing or floor at a rotation (set by main from the current texture set). */
  ghostTexture: (defKind: "thing" | "floor", def: string, rot: number) => Texture | null = () => null;
  spec: ToolSpec | null = null;
  layer = 0;
  /** Facing for rotatable buildings: 0 = east, 1 = south, 2 = west, 3 = north. */
  rot = 0;
  private start: Tile | null = null;
  private end: Tile | null = null;
  onApplied: () => void = () => {};

  constructor(
    private game: Game,
    parent: Container,
  ) {
    parent.addChild(this.ghosts, this.preview);
  }

  set(spec: ToolSpec | null) {
    this.spec = spec;
    this.hovered = null;
    this.cancel();
  }

  private tileAt(wx: number, wy: number): Tile {
    return { x: Math.floor(wx / TILE), y: Math.floor(wy / TILE) };
  }

  private hovered: Tile | null = null;

  /** Turn the building a quarter (Q/E or the button) and redraw the preview under the cursor at once. */
  rotate(d: number) {
    this.rot = (this.rot + d + 4) % 4;
    this.draw();
  }

  hover(wx: number, wy: number) {
    const t = this.tileAt(wx, wy);
    if (this.start || (this.hovered && this.hovered.x === t.x && this.hovered.y === t.y)) return;
    this.hovered = t;
    this.draw();
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
    // Redraw (or clear) the outline and the building ghosts.
    this.draw();
  }

  /** Tiles covered by the current drag, by tool shape. */
  tiles(): Tile[] {
    const a = this.start!, b = this.end!;
    const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
    const out: Tile[] = [];
    const spec = this.spec!;
    // Big things go down one at a time, where the mouse lets go.
    const [sw, sh] = this.size();
    if (sw * sh > 1) return [{ x: b.x, y: b.y }];
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

  /** Everything turns while placing (Q/E), except walls, doors, wires, pipes and plants; floors never turn. */
  rotatable(): boolean {
    const s = this.spec;
    if (s?.kind !== "build" || s.defKind !== "thing") return false;
    const d = this.game.reg.things.get(s.def);
    return !d.wall && !d.door && !d.conduit && !d.pipe && d.kind !== "plant";
  }

  /** Footprint of the thing being placed, after rotation (1x1 for other tools). */
  size(): [number, number] {
    const s = this.spec;
    if (s?.kind !== "build" || s.defKind !== "thing") return [1, 1];
    const [w, h] = this.game.reg.things.get(s.def).footprint;
    return this.rot % 2 ? [h, w] : [w, h];
  }

  private valid(t: Tile): boolean {
    const g = this.game, s = this.spec!, l = this.layer;
    const L = g.map.layers[l];
    if (!L.inBounds(t.x, t.y)) return false;
    const i = L.i(t.x, t.y);
    switch (s.kind) {
      case "build":
        return canPlace(g, s.defKind, s.def, l, t.x, t.y, this.rotatable() ? this.rot : undefined);
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

  /** Show see-through ghosts of the building on these tiles (at most 40), tinted green or red. */
  private drawGhosts(tiles: Tile[]) {
    const s = this.spec;
    const n = s?.kind === "build" ? Math.min(40, tiles.length) : 0;
    const texture = n && s?.kind === "build" ? this.ghostTexture(s.defKind, s.def, this.rotatable() ? this.rot : 0) : null;
    while (this.ghosts.children.length < n) this.ghosts.addChild(new Sprite());
    const [pw, ph] = this.size();
    this.ghosts.children.forEach((c, k) => {
      const sp = c as Sprite;
      sp.visible = !!texture && k < n;
      if (!sp.visible) return;
      const t = tiles[k];
      sp.texture = texture!;
      sp.position.set(t.x * TILE, t.y * TILE);
      sp.width = pw * TILE;
      sp.height = ph * TILE;
      sp.tint = this.valid(t) ? 0xc8f0a0 : 0xff9080;
      sp.alpha = 0.7;
    });
  }

  private draw() {
    this.preview.clear();
    this.drawGhosts(!this.spec ? [] : this.start ? [...this.tiles()] : this.hovered ? [this.hovered] : []);
    if (!this.spec) return;
    if (!this.start) {
      // Not dragging: outline the tile under the mouse, green if the tool works there.
      if (!this.hovered) return;
      const t = this.hovered, ok = this.valid(t);
      const [hw, hh] = this.size();
      this.preview.rect(t.x * TILE, t.y * TILE, hw * TILE, hh * TILE).stroke({ width: 2, color: ok ? 0x9fd14a : 0xc2453a, alpha: 0.95 });
      return;
    }
    const DIRS: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    for (const t of this.tiles()) {
      const ok = this.valid(t);
      const [pw, ph] = this.size();
      this.preview
        .rect(t.x * TILE + 1, t.y * TILE + 1, pw * TILE - 2, ph * TILE - 2)
        .fill({ color: ok ? 0x9fd14a : 0xc2453a, alpha: 0.25 })
        .stroke({ width: 1, color: ok ? 0x9fd14a : 0xc2453a, alpha: 0.8 });
      if (this.rotatable() && pw * ph === 1) {
        const [dx, dy] = DIRS[this.rot];
        const cx = t.x * TILE + TILE / 2, cy = t.y * TILE + TILE / 2;
        this.preview.moveTo(cx - dx * 8, cy - dy * 8).lineTo(cx + dx * 10, cy + dy * 10).stroke({ width: 3, color: 0xe3c25a });
      }
    }
  }

  private apply(tiles: Tile[]) {
    const g = this.game, s = this.spec!, l = this.layer;
    const L = g.map.layers[l];
    switch (s.kind) {
      case "build":
        for (const t of tiles) placeBlueprint(g, s.defKind, s.def, l, t.x, t.y, this.rotatable() ? this.rot : undefined);
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
