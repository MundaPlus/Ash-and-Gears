/**
 * Draws the visible layer of the home map.
 * Close up: chunk containers of sprites, hidden when off screen.
 * Far out: one small overview texture per layer (1 pixel per tile), so phones stay fast.
 */
import { Container, Sprite, Texture } from "pixi.js";
import { NO_THING, type Game } from "@wc/sim";
import { TILE, type TextureSet } from "./textures.ts";

const CHUNK = 32;
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
    private tex: TextureSet,
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
      if (vis && c.version !== this.game.mapVersion) this.buildChunk(this.layer, c);
    }
  }

  private buildChunk(l: number, c: Chunk) {
    const g = this.game, L = g.map.layers[l];
    c.root.removeChildren().forEach((ch) => ch.destroy());
    const things: Sprite[] = [];
    for (let y = c.cy * CHUNK; y < Math.min(L.h, (c.cy + 1) * CHUNK); y++)
      for (let x = c.cx * CHUNK; x < Math.min(L.w, (c.cx + 1) * CHUNK); x++) {
        const i = L.i(x, y);
        const s = new Sprite(this.tex.terrain[L.terrain[i]]);
        s.position.set((x - c.cx * CHUNK) * TILE, (y - c.cy * CHUNK) * TILE);
        c.root.addChild(s);
        const th = L.thing[i];
        if (th !== NO_THING) {
          const t = new Sprite(this.tex.things[g.things.get(th)!.def]);
          t.position.copyFrom(s.position);
          things.push(t);
        }
      }
    // Things after all terrain, so tall sprites are never covered by the next row of ground.
    for (const t of things) c.root.addChild(t);
    c.version = g.mapVersion;
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
