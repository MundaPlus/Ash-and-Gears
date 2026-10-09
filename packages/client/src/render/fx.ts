/** Combat tracers, melee flashes and fire, drawn each frame over the world. */
import { Graphics } from "pixi.js";
import type { Game } from "@wc/sim";
import { TILE } from "./textures.ts";

/** Ticks a tracer stays visible. */
const SHOT_TICKS = 6;

export class FxRenderer {
  readonly gfx = new Graphics();
  layer = 0;

  constructor(private game: Game) {}

  update(timeSec: number, view: { x: number; y: number; w: number; h: number }) {
    const g = this.gfx, game = this.game;
    g.clear();
    for (const f of game.fx) {
      const age = game.tick - f.tick;
      if (age > SHOT_TICKS || age < 0 || f.layer !== this.layer) continue;
      const a = 1 - age / SHOT_TICKS;
      const x1 = (f.from.x + 0.5) * TILE, y1 = (f.from.y + 0.5) * TILE;
      let x2 = (f.to.x + 0.5) * TILE, y2 = (f.to.y + 0.5) * TILE;
      if (f.kind === "melee") {
        g.circle(x2, y2, 8 + age).stroke({ width: 2, color: f.hit ? 0xff6a4a : 0xefd8a4, alpha: a });
        continue;
      }
      // Misses fly a little past the target, off to the side.
      if (!f.hit) {
        x2 += ((f.tick % 7) - 3) * 4;
        y2 += ((f.tick % 5) - 2) * 4;
      }
      g.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: f.kind === "turret" ? 2 : 1.5, color: 0xffe08a, alpha: a });
      if (f.hit) g.circle(x2, y2, 3 + age).fill({ color: 0xc2453a, alpha: a * 0.8 });
    }
    // Fire: flickering flames on burning tiles in view.
    const { w, h } = game.map;
    for (const [n, intensity] of game.fires) {
      const layer = Math.floor(n / (w * h));
      if (layer !== this.layer) continue;
      const r = n - layer * w * h;
      const x = (r % w) * TILE, y = Math.floor(r / w) * TILE;
      if (x < view.x - TILE || y < view.y - TILE || x > view.x + view.w || y > view.y + view.h) continue;
      const flick = 0.75 + 0.25 * Math.sin(timeSec * 13 + n);
      const s = TILE * (0.4 + intensity * 0.5) * flick;
      g.rect(x + (TILE - s) / 2, y + TILE - s - 2, s, s).fill({ color: 0xd9742e, alpha: 0.75 });
      g.rect(x + (TILE - s * 0.5) / 2, y + TILE - s * 0.8 - 2, s * 0.5, s * 0.6).fill({ color: 0xffd27a, alpha: 0.85 });
    }
  }
}
