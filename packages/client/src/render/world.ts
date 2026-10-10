/**
 * Draws the visible layer of the home map.
 * Close up: chunk containers of sprites, hidden when off screen.
 * Far out: one small overview texture per layer (1 pixel per tile), so phones stay fast.
 */
import { Container, Sprite, Texture } from "pixi.js";
import { CHUNK, NO_THING, type Game } from "@wc/sim";
import { WALL_E, WALL_N, WALL_S, WALL_W } from "@wc/data";

/** Tiles wide and high of a thing def with a rotation (1 and 3 swap them). */
function sizeOf(g: Game, def: number, rot = 0): [number, number] {
  const [w, h] = g.reg.things.list[def].footprint;
  return rot % 2 ? [h, w] : [w, h];
}
import { TILE, variantAt, type TextureSet } from "./textures.ts";

/** Below this zoom the overview texture replaces the chunks. */
const OVERVIEW_ZOOM = 0.3;

interface Chunk {
  cx: number;
  cy: number;
  root: Container;
  /** Items, things and marks of this chunk. Kept above all ground, so big things can reach into the next chunk. */
  top: Container;
  version: number;
}

export class WorldRenderer {
  readonly root = new Container();
  private layerRoots: Container[] = [];
  private chunks: Chunk[][] = [];
  private overview: Sprite[] = [];
  private overviewVersion: number[] = [];
  layer = 0;

  constructor(
    private game: Game,
    public tex: TextureSet,
  ) {
    const { w, h } = game.map;
    for (const L of game.map.layers) {
      const lr = new Container();
      lr.visible = L.index === 0;
      this.root.addChild(lr);
      this.layerRoots.push(lr);
      const ground = new Container();
      const tops = new Container();
      lr.addChild(ground, tops);
      const list: Chunk[] = [];
      for (let cy = 0; cy < Math.ceil(h / CHUNK); cy++)
        for (let cx = 0; cx < Math.ceil(w / CHUNK); cx++) {
          const root = new Container();
          root.position.set(cx * CHUNK * TILE, cy * CHUNK * TILE);
          root.visible = false;
          ground.addChild(root);
          const top = new Container();
          top.position.copyFrom(root.position);
          top.visible = false;
          tops.addChild(top);
          list.push({ cx, cy, root, top, version: -1 });
        }
      this.chunks.push(list);
      const ov = new Sprite(Texture.EMPTY);
      ov.scale.set(TILE);
      ov.visible = false;
      lr.addChild(ov);
      this.overview.push(ov);
      this.overviewVersion.push(-1);
    }
  }

  /** New textures (palette or size changed): redraw everything. */
  setTextures(tex: TextureSet) {
    this.tex = tex;
    for (const list of this.chunks) for (const c of list) c.version = -1;
  }

  setLayer(l: number) {
    this.layer = l;
    this.layerRoots.forEach((r, i) => (r.visible = i === l));
  }

  /** Call every frame with the camera's visible world rectangle (in world pixels). */
  update(view: { x: number; y: number; w: number; h: number }, zoom: number) {
    const far = zoom < OVERVIEW_ZOOM;
    const ov = this.overview[this.layer];
    ov.visible = far;
    if (far) {
      if (this.overviewVersion[this.layer] !== this.game.mapVersion) this.buildOverview(this.layer);
      for (const c of this.chunks[this.layer]) c.root.visible = c.top.visible = false;
      return;
    }
    const span = CHUNK * TILE;
    for (const c of this.chunks[this.layer]) {
      const x0 = c.cx * span, y0 = c.cy * span;
      const vis = x0 < view.x + view.w && x0 + span > view.x && y0 < view.y + view.h && y0 + span > view.y;
      c.root.visible = c.top.visible = vis;
      if (vis) {
        const L = this.game.map.layers[this.layer];
        const v = L.chunkVersion[c.cy * L.chunksX + c.cx];
        if (c.version !== v) this.buildChunk(this.layer, c, v);
      }
    }
  }

  private buildChunk(l: number, c: Chunk, version: number) {
    const g = this.game, L = g.map.layers[l];
    c.root.removeChildren().forEach((ch) => ch.destroy());
    c.top.removeChildren().forEach((ch) => ch.destroy());
    const things: Sprite[] = [];
    const items: Sprite[] = [];
    const overlays: Sprite[] = [];
    const marks: Sprite[] = [];
    for (let y = c.cy * CHUNK; y < Math.min(L.h, (c.cy + 1) * CHUNK); y++)
      for (let x = c.cx * CHUNK; x < Math.min(L.w, (c.cx + 1) * CHUNK); x++) {
        const i = L.i(x, y);
        const fl = L.floor[i];
        const s = new Sprite(fl ? this.tex.floors[fl - 1] : this.tex.terrain[L.terrain[i]][variantAt(x, y)]);
        s.position.set((x - c.cx * CHUNK) * TILE, (y - c.cy * CHUNK) * TILE);
        s.width = s.height = TILE;
        c.root.addChild(s);
        // Soft borders: a neighbor ground of a higher layer spills a dithered edge onto this tile.
        if (!fl) {
          const here = this.tex.terrainLayers[L.terrain[i]];
          [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(([dx, dy], dir) => {
            const nx = x + dx, ny = y + dy;
            if (!L.inBounds(nx, ny)) return;
            const ni = L.i(nx, ny);
            const nt = L.terrain[ni];
            if (nt === L.terrain[i] || L.floor[ni] || this.tex.terrainLayers[nt] <= here) return;
            const e = new Sprite(this.tex.terrainEdges[nt][dir]);
            e.position.copyFrom(s.position);
            e.width = e.height = TILE;
            c.root.addChild(e);
          });
        }
        const z = L.zone[i];
        if (z !== NO_THING) {
          const zs = new Sprite(Texture.WHITE);
          zs.width = zs.height = TILE;
          zs.position.copyFrom(s.position);
          zs.tint = g.zones.get(z)?.kind === "grow" ? 0x9fd14a : 0x6fa0ff;
          zs.alpha = 0.16;
          overlays.push(zs);
        }
        const bpId = L.blueprint[i];
        const bpHere = bpId !== NO_THING ? g.blueprints.get(bpId)! : null;
        // A big plan draws once, from its top-left tile.
        if (bpHere && bpHere.x === x && bpHere.y === y) {
          const bp = bpHere;
          const [bw, bh] = bp.kind === "thing" ? sizeOf(g, bp.def, bp.rot) : [1, 1];
          const turnedBp = bp.kind === "thing" && bp.rot && bp.rot % 2 ? this.tex.thingsTurned[bp.def] : null;
          const bs = new Sprite(bp.kind === "floor" ? this.tex.floors[bp.def] : (turnedBp ?? this.tex.things[bp.def]));
          bs.position.copyFrom(s.position);
          bs.width = bw * TILE;
          bs.height = bh * TILE;
          bs.tint = 0xa8d0ff;
          bs.alpha = Object.values(bp.need).some((n) => n > 0) ? 0.55 : 0.8;
          overlays.push(bs);
        }
        // A room that waits for its roof: a faint hatch, until a survivor builds it.
        if (L.index === 0 && L.roofWant[i] && !L.roof[i]) {
          const rs = new Sprite(Texture.WHITE);
          rs.position.copyFrom(s.position);
          rs.width = rs.height = TILE;
          rs.tint = 0x7fb0e0;
          rs.alpha = 0.22;
          marks.push(rs);
        }
        const d = L.desig[i];
        if (d) {
          const ds = new Sprite(this.tex.desig[d]);
          ds.position.copyFrom(s.position);
          ds.width = ds.height = TILE;
          marks.push(ds);
        }
        const it = L.item[i];
        if (it !== NO_THING) {
          const st = g.items.get(it)!;
          const t = new Sprite(this.tex.items[st.def]);
          // Items lie a bit smaller than a full tile.
          t.width = t.height = TILE * 0.85;
          t.position.set(s.x + TILE * 0.075, s.y + TILE * 0.1);
          if (st.contaminated) t.tint = 0xb8ff6a;
          items.push(t);
        }
        const th = L.thing[i];
        // A big thing draws once, from its top-left tile.
        if (th !== NO_THING && g.things.get(th)!.x === x && g.things.get(th)!.y === y) {
          const thing = g.things.get(th)!;
          const turnedBig = thing.rot && thing.rot % 2 ? this.tex.thingsTurned[thing.def] : null;
          const t = new Sprite(turnedBig ?? this.tex.things[thing.def]);
          const def = g.reg.things.list[thing.def];
          const [fw, fh] = sizeOf(g, thing.def, thing.rot);
          if (def.crop) {
            // Crops grow in size; contaminated ones glow green.
            const sc = 0.35 + 0.65 * Math.min(1, thing.growth ?? 0);
            t.anchor.set(0.5, 1);
            t.width = t.height = TILE * sc;
            t.position.set(s.x + TILE / 2, s.y + TILE);
            if ((thing.contamUntil ?? 0) > g.tick) t.tint = 0xb8ff6a;
          } else if (def.rotatable && def.belt) {
            // Belts turn with their facing (the art runs left to right).
            t.anchor.set(0.5);
            t.width = t.height = TILE;
            t.rotation = ((thing.rot ?? 0) * Math.PI) / 2;
            t.position.set(s.x + TILE / 2, s.y + TILE / 2);
          } else {
            // Walls join with walls and doors; wires with wires and powered things; sandbags turn in a column.
            const near = (test: (d: (typeof g.reg.things.list)[number]) => boolean) => {
              const at = (nx: number, ny: number) => {
                if (!L.inBounds(nx, ny)) return false;
                const o = L.thing[L.i(nx, ny)];
                return o !== NO_THING && test(g.reg.things.list[g.things.get(o)!.def]);
              };
              return (at(x, y - 1) ? WALL_N : 0) | (at(x + 1, y) ? WALL_E : 0) | (at(x, y + 1) ? WALL_S : 0) | (at(x - 1, y) ? WALL_W : 0);
            };
            const joined = this.tex.walls[thing.def];
            const line = this.tex.lines[thing.def];
            const turned = this.tex.turned[thing.def];
            const d0 = def;
            if (joined) t.texture = joined[near((d) => d.wall)];
            else if (line) {
              // Wires join wires and reach into machines next to them. Belts are left alone (no comb under a belt line).
              // Pipes join pipes and fluid machines.
              t.texture = def.pipe ? line[near((d) => d.pipe || !!d.fluid)] : line[near((d) => !!d.conduit || (!!d.power && !d.belt))];
            }
            else if (d0.power && !d0.belt && this.tex.stubs.length) {
              // A machine next to wires: the wire runs in under it, to its middle.
              const m = near((d) => !!d.conduit);
              if (m) {
                const st = new Sprite(this.tex.stubs[m]);
                st.width = st.height = TILE;
                st.position.copyFrom(s.position);
                things.push(st);
              }
            } else if (turned) {
              const m = near((d) => d.id === def.id);
              if (m & (WALL_N | WALL_S) && !(m & (WALL_E | WALL_W))) t.texture = turned;
            }
            t.width = fw * TILE;
            t.height = fh * TILE;
            t.position.copyFrom(s.position);
            if (def.switch && thing.off) t.tint = 0x707070;
          }
          things.push(t);
        }
      }
    // Zones, plans, items, things and marks go on top of every chunk's ground (big plans reach over chunk edges).
    for (const t of overlays) c.top.addChild(t);
    for (const t of items) c.top.addChild(t);
    for (const t of things) c.top.addChild(t);
    for (const t of marks) c.top.addChild(t);
    c.version = version;
  }

  private buildOverview(l: number) {
    const g = this.game, L = g.map.layers[l];
    const cv = document.createElement("canvas");
    cv.width = L.w;
    cv.height = L.h;
    const ctx = cv.getContext("2d")!;
    const img = ctx.createImageData(L.w, L.h);
    const rgb = (hex: string) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
    const tCol = g.reg.terrain.list.map((d) => rgb(d.color));
    const thCol = g.reg.things.list.map((d) => rgb(d.color));
    for (let i = 0; i < L.w * L.h; i++) {
      const th = L.thing[i];
      const c = th !== NO_THING ? thCol[g.things.get(th)!.def] : tCol[L.terrain[i]];
      img.data.set([c[0], c[1], c[2], 255], i * 4);
    }
    ctx.putImageData(img, 0, 0);
    const old = this.overview[l].texture;
    const t = Texture.from(cv);
    t.source.scaleMode = "nearest";
    this.overview[l].texture = t;
    if (old !== Texture.EMPTY) old.destroy(true);
    this.overviewVersion[l] = g.mapVersion;
  }
}
