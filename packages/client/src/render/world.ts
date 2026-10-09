/**
 * Draws the visible layer of the home map.
 * Close up: chunk containers of sprites, hidden when off screen.
 * Far out: one small overview texture per layer (1 pixel per tile), so phones stay fast.
 */
import { Container, Sprite, Texture } from "pixi.js";
import { CHUNK, NO_THING, type Game } from "@wc/sim";
import { TILE, variantAt, type TextureSet } from "./textures.ts";

/** Below this zoom the overview texture replaces the chunks. */
const OVERVIEW_ZOOM = 0.3;

interface Chunk {
  cx: number;
  cy: number;
  root: Container;
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
      const list: Chunk[] = [];
      for (let cy = 0; cy < Math.ceil(h / CHUNK); cy++)
        for (let cx = 0; cx < Math.ceil(w / CHUNK); cx++) {
          const root = new Container();
          root.position.set(cx * CHUNK * TILE, cy * CHUNK * TILE);
          root.visible = false;
          lr.addChild(root);
          list.push({ cx, cy, root, version: -1 });
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
      for (const c of this.chunks[this.layer]) c.root.visible = false;
      return;
    }
    const span = CHUNK * TILE;
    for (const c of this.chunks[this.layer]) {
      const x0 = c.cx * span, y0 = c.cy * span;
      const vis = x0 < view.x + view.w && x0 + span > view.x && y0 < view.y + view.h && y0 + span > view.y;
      c.root.visible = vis;
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
        if (bpId !== NO_THING) {
          const bp = g.blueprints.get(bpId)!;
          const bs = new Sprite(bp.kind === "floor" ? this.tex.floors[bp.def] : this.tex.things[bp.def]);
          bs.position.copyFrom(s.position);
          bs.width = bs.height = TILE;
          bs.tint = 0xa8d0ff;
          bs.alpha = Object.values(bp.need).some((n) => n > 0) ? 0.55 : 0.8;
          overlays.push(bs);
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
        if (th !== NO_THING) {
          const thing = g.things.get(th)!;
          const t = new Sprite(this.tex.things[thing.def]);
          const def = g.reg.things.list[thing.def];
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
            t.width = t.height = TILE;
            t.position.copyFrom(s.position);
          }
          things.push(t);
        }
      }
    // Items and things after all terrain, so tall sprites are never covered by the next row of ground.
    for (const t of overlays) c.root.addChild(t);
    for (const t of items) c.root.addChild(t);
    for (const t of things) c.root.addChild(t);
    for (const t of marks) c.root.addChild(t);
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
