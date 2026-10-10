/**
 * Things that change every frame: belt cargo, direction arrows, "no power" icons and night lights.
 * Drawn with one Graphics object over the chunk layer.
 */
import { Graphics } from "pixi.js";
import { DIRS4, isPowered, poleLinks, type Game } from "@wc/sim";
import { TILE } from "./textures.ts";

/** Overlay colors for power networks. */
const NET_COLORS = [0x4fc3f7, 0xffd54f, 0x81c784, 0xba68c8, 0xff8a65, 0x4db6ac, 0xf06292, 0xaed581];

export class DynamicRenderer {
  readonly gfx = new Graphics();
  /** Light glows: drawn above the night overlay in screen space by main.ts. */
  readonly lights = new Graphics();
  layer = 0;
  /** Power overlay: each network in its own color, machines without power outlined red. */
  powerOverlay = false;

  constructor(private game: Game) {
    this.lights.blendMode = "add";
  }

  update(timeSec: number, view: { x: number; y: number; w: number; h: number }, darkness: number, toScreen: (x: number, y: number) => { x: number; y: number }, zoom: number) {
    const g = this.gfx, game = this.game;
    g.clear();
    this.lights.clear();
    for (const t of game.things.values()) {
      if (t.layer !== this.layer) continue;
      const px = t.x * TILE, py = t.y * TILE;
      if (px < view.x - TILE * 8 || py < view.y - TILE * 8 || px > view.x + view.w + TILE * 8 || py > view.y + view.h + TILE * 8) continue;
      const d = game.reg.things.list[t.def];
      // Power poles: a cable to each linked pole (drawn once per pair).
      if (d.pole)
        for (const o of poleLinks(game, t))
          if (o.id > t.id) g.moveTo(px + TILE / 2, py + 5).lineTo(o.x * TILE + TILE / 2, o.y * TILE + 5).stroke({ width: 1.5, color: 0x3a2e26, alpha: 0.85 });
      if (this.powerOverlay && (d.power || d.conduit)) {
        const net = game.netOf.get(t.id);
        const hue = net === undefined ? 0x777777 : NET_COLORS[net % NET_COLORS.length];
        for (const f of game.footprint(t.def, t.x, t.y, t.rot)) g.rect(f.x * TILE, f.y * TILE, TILE, TILE).fill({ color: hue, alpha: 0.35 });
        if (d.power?.use && !isPowered(game, t)) g.rect(px + 1, py + 1, TILE - 2, TILE - 2).stroke({ width: 2, color: 0xff4a3a });
      }
      // Direction arrow on rotatable things.
      if (d.rotatable) {
        const [dx, dy] = DIRS4[t.rot ?? 0];
        const cx = px + TILE / 2, cy = py + TILE / 2;
        g.moveTo(cx - dx * 8 - dy * 6, cy - dy * 8 + dx * 6)
          .lineTo(cx + dx * 9, cy + dy * 9)
          .lineTo(cx - dx * 8 + dy * 6, cy - dy * 8 - dx * 6)
          .stroke({ width: 2, color: 0xe3c25a, alpha: 0.85 });
      }
      // Belt cargo: a small crate sliding along.
      if (d.belt && t.cargo) {
        const [dx, dy] = DIRS4[t.rot ?? 0];
        const off = (t.cargo.progress - 0.5) * TILE;
        const cx = px + TILE / 2 + dx * off, cy = py + TILE / 2 + dy * off;
        const col = parseInt(game.reg.items.list[t.cargo.def].color.slice(1), 16);
        g.rect(cx - 6, cy - 6, 12, 12).fill(col).stroke({ width: 1, color: 0x1b1714 });
      }
      // Missing power: a red bolt that blinks.
      if (d.power?.use && !isPowered(game, t) && Math.sin(timeSec * 5) > 0) {
        const cx = px + TILE - 9, cy = py + 3;
        g.poly([cx + 4, cy, cx, cy + 7, cx + 3, cy + 7, cx + 1, cy + 13, cx + 7, cy + 5, cx + 4, cy + 5]).fill(0xff4a3a);
      }
      // Light: lamps when powered, fires always. Only drawn at night.
      if (d.light && darkness > 0.05 && isPowered(game, t)) {
        const s = toScreen((t.x + 0.5) * TILE, (t.y + 0.5) * TILE);
        const r = d.light * TILE * zoom;
        const flick = d.id === "campfire" ? 0.9 + 0.1 * Math.sin(timeSec * 9 + t.id) : 1;
        for (let k = 10; k >= 1; k--) this.lights.circle(s.x, s.y, (r * k) / 10).fill({ color: 0xffb060, alpha: 0.028 * darkness * flick });
      }
    }
  }
}
