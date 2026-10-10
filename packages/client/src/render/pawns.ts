/**
 * Draws survivors with smooth movement between tiles and small procedural motion
 * (walk bob, facing flip, sleeping pose). No frame animation (spec 09).
 */
import { Container, Graphics, Sprite, Text } from "pixi.js";
import { PALETTES, SHIRTS, t } from "@wc/data";
import { pain, type Game, type Pawn } from "@wc/sim";
import { TILE, type TextureSet } from "./textures.ts";
import { chargeBar } from "./dynamic.ts";

/** A stable color per survivor, from a small warm palette that reads on dirt and asphalt. */
/** UI swatch color per survivor: the middle color of its shirt ramp (rust palette). */
const SHIRT_SWATCH = SHIRTS.map(([, b]) => parseInt(PALETTES.rust[b].slice(1), 16));

interface View {
  root: Container;
  body: Sprite;
  label: Text;
  zzz: Text;
  flag: Graphics;
  hp: Graphics;
  shadow: Sprite;
  /** Salvage Print: facing 0 S, 1 E, 2 N, 3 W (kept while standing). */
  dir: number;
}

export class PawnRenderer {
  readonly root = new Container();
  private views = new Map<number, View>();
  private ring = new Graphics();
  selected: number | null = null;
  layer = 0;

  constructor(
    private game: Game,
    private tex: TextureSet,
  ) {
    void this.tex;
    this.ring.circle(0, 0, 15).stroke({ width: 2, color: 0xefd8a4, alpha: 0.9 });
    this.ring.visible = false;
    this.root.addChild(this.ring);
  }

  static colorOf(p: Pawn): number {
    return SHIRT_SWATCH[p.id % SHIRT_SWATCH.length];
  }

  private textureFor(p: Pawn) {
    if (p.robot) return this.tex.creatures[this.game.reg.content.creatures[p.creature].id] ?? this.tex.raiders[0];
    if (p.faction === "colony") return this.tex.survivors[p.id % this.tex.survivors.length];
    const creature = this.game.reg.content.creatures[p.creature];
    const raider = this.tex.raiders[p.id % this.tex.raiders.length];
    if (creature.behavior === "human") return raider;
    return this.tex.creatures[creature.id] ?? raider;
  }

  /** Salvage Print frames for people ([facing][frame]), or null for creatures, robots and the pixel style. */
  private printFrames(p: Pawn) {
    const people = this.tex.people;
    if (!people || p.robot) return null;
    const creature = this.game.reg.content.creatures[p.creature];
    if (creature.behavior !== "human") return null;
    const raider = p.faction === "raiders" || p.faction === "prisoner";
    const list = raider ? people.raiders : people.survivors;
    return list[p.id % list.length];
  }

  /** New textures (palette or size changed). */
  setTextures(tex: TextureSet) {
    this.tex = tex;
    for (const [id, v] of this.views) {
      const p = this.game.pawns.get(id);
      if (p) v.body.texture = this.textureFor(p);
    }
  }

  /** World pixel position of a pawn, between its tile and the next path tile. */
  static worldPos(p: Pawn): { x: number; y: number } {
    let x = p.x, y = p.y;
    const next = p.path?.[0];
    if (next && next.layer === p.layer) {
      x += (next.x - p.x) * p.moveT;
      y += (next.y - p.y) * p.moveT;
    }
    return { x: (x + 0.5) * TILE, y: (y + 0.5) * TILE };
  }

  private make(p: Pawn): View {
    const root = new Container();
    const shadow = new Sprite(this.tex.shadow);
    shadow.anchor.set(0.5);
    const body = new Sprite(this.textureFor(p));
    body.anchor.set(0.5, 0.5);
    body.width = body.height = TILE;
    shadow.width = shadow.height = TILE;
    const labelColor = p.faction === "colony" ? 0xefd8a4 : p.faction === "prisoner" || p.faction === "visitor" || p.faction === "trader" ? 0xe3c25a : 0xff8a70;
    const label = new Text({ text: p.nick, style: { fontFamily: "monospace", fontSize: 11, fill: labelColor, stroke: { color: 0x1b1714, width: 3 } } });
    label.anchor.set(0.5, 0);
    label.position.set(0, 14);
    label.resolution = 2;
    const zzz = new Text({ text: "z z", style: { fontFamily: "monospace", fontSize: 12, fill: 0xd6ab6b, stroke: { color: 0x1b1714, width: 3 } } });
    zzz.anchor.set(0, 1);
    zzz.position.set(6, -10);
    zzz.visible = false;
    // Drafted marker: a small rust flag above the head.
    const flag = new Graphics().rect(-1, -26, 2, 10).fill(0xefd8a4).poly([1, -26, 9, -23, 1, -20]).fill(0xd9742e);
    flag.visible = false;
    // Health bar for hostiles and hurt survivors.
    const hp = new Graphics();
    root.addChild(shadow, body, label, zzz, flag, hp);
    this.root.addChild(root);
    return { root, body, label, zzz, flag, hp, shadow, dir: 0 };
  }

  update(timeSec: number, zoom: number) {
    const seen = new Set<number>();
    for (const p of this.game.pawns.values()) {
      seen.add(p.id);
      let v = this.views.get(p.id);
      if (!v) {
        v = this.make(p);
        this.views.set(p.id, v);
      }
      v.root.visible = p.layer === this.layer;
      if (!v.root.visible) continue;
      const pos = PawnRenderer.worldPos(p);
      v.root.position.set(pos.x, pos.y);
      const moving = !!p.path?.length;
      const sz = 1;
      if (p.health.downed) {
        v.body.rotation = Math.PI / 2;
        v.body.x = 0;
        v.body.y = 5;
        v.zzz.visible = false;
      } else if (p.asleep) {
        // In a bed: lie in its middle, head toward the pillow (the pillow is at the top before the bed turns).
        // On the ground: lie on the side.
        const L = this.game.map.layers[p.layer];
        const tid = L.inBounds(p.x, p.y) ? L.thing[L.i(p.x, p.y)] : -1;
        const bed = tid !== -1 ? this.game.things.get(tid) : undefined;
        if (bed && this.game.reg.things.list[bed.def].bed) {
          const rot = bed.rot ?? 0;
          const [w, h] = this.game.reg.things.list[bed.def].footprint;
          const [fw, fh] = rot % 2 ? [h, w] : [w, h];
          // Toward the pillow by a quarter of the bed's long side.
          const [hx, hy] = [[0, -1], [1, 0], [0, 1], [-1, 0]][rot];
          const pull = (Math.max(fw, fh) * TILE) / 4 - TILE / 2;
          v.body.rotation = (rot * Math.PI) / 2;
          v.body.x = (bed.x + fw / 2) * TILE - pos.x + hx * pull;
          v.body.y = (bed.y + fh / 2) * TILE - pos.y + hy * pull;
        } else {
          v.body.rotation = -Math.PI / 2;
          v.body.x = 0;
          v.body.y = 4;
        }
        v.zzz.visible = true;
        v.zzz.alpha = 0.5 + 0.5 * Math.sin(timeSec * 2 + p.id);
      } else {
        v.body.rotation = 0;
        v.body.x = 0;
        v.zzz.visible = false;
        // Walk bob: two hops per tile-ish; idle breathing is a smaller wave.
        v.body.y = moving ? -Math.abs(Math.sin(timeSec * 10 + p.id)) * 3 : Math.sin(timeSec * 2 + p.id) * 0.6;
      }
      // Salvage Print people: a texture per facing and walking frame, with headroom above the tile.
      const frames = this.printFrames(p);
      v.shadow.visible = !frames;
      if (frames) {
        const next = p.path?.[0];
        if (moving && next) {
          const dx = next.x - p.x, dy = next.y - p.y;
          v.dir = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 1 : dx < 0 ? 3 : v.dir) : dy > 0 ? 0 : 2;
        } else if (p.job) v.dir = p.facing > 0 ? 1 : 3;
        else if (!p.asleep && !p.health.downed) v.dir = 0;
        const fr = moving ? 1 + (Math.floor(timeSec * 6 + p.id) % 2) : 0;
        const h = this.tex.people!.headroom;
        v.body.texture = frames[v.dir][fr];
        v.body.anchor.set(0.5, (0.5 + h) / (1 + h));
        v.body.width = TILE;
        v.body.height = TILE * (1 + h);
        if (!p.health.downed && !p.asleep) v.body.y = 0;
      }
      else {
        // Pixel style: one square texture, mirrored for left and right.
        v.body.anchor.set(0.5, 0.5);
        v.body.width = v.body.height = TILE;
        v.body.scale.x = Math.abs(v.body.scale.x) * p.facing * sz;
      }

      v.flag.visible = p.drafted;
      // Health bar: shows when hurt.
      const hurt = Math.min(1, p.health.bloodLoss + pain(this.game, p));
      v.hp.clear();
      if (hurt > 0.05 || p.faction !== "colony") {
        v.hp.rect(-10, -20, 20, 3).fill({ color: 0x1b1714, alpha: 0.8 });
        v.hp.rect(-10, -20, 20 * (1 - hurt), 3).fill(p.faction === "colony" ? 0x9fb84a : 0xc2453a);
      }
      // Robots: the charge bar above the head, red to yellow to green.
      if (p.robot) chargeBar(v.hp, -10, -25, 20, 4, p.charge ?? 1);
      v.body.alpha = p.mentalBreak ? 0.75 : 1;
      v.label.visible = zoom > 0.55;
      const name = p.faction === "wild" ? t(`creature.${p.nick}`) : p.nick;
      v.label.text = p.mentalBreak ? t("pawn.sulking", { name }) : p.health.downed ? t("pawn.downed_label", { name }) : name;
      if (p.id === this.selected) {
        this.ring.visible = true;
        this.ring.position.set(pos.x, pos.y + 4);
      }
    }
    // Name labels of survivors close together: push the later ones down so none overlap.
    const placed: { x: number; y: number; w: number; h: number }[] = [];
    const shown = [...this.views.values()].filter((v) => v.root.visible && v.label.visible).sort((a, b) => a.root.y - b.root.y || a.root.x - b.root.x);
    for (const v of shown) {
      v.label.y = 14;
      const w = v.label.width, h = v.label.height;
      const box = { x: v.root.x - w / 2, y: v.root.y + 14, w, h };
      for (let tries = 0; tries < 4 && placed.some((o) => box.x < o.x + o.w && o.x < box.x + box.w && box.y < o.y + o.h && o.y < box.y + box.h); tries++) {
        box.y += h - 2;
        v.label.y += h - 2;
      }
      placed.push(box);
    }
    if (this.selected === null || !this.game.pawns.get(this.selected) || this.game.pawns.get(this.selected)!.layer !== this.layer)
      this.ring.visible = false;
    for (const [id, v] of this.views)
      if (!seen.has(id)) {
        v.root.destroy({ children: true });
        this.views.delete(id);
      }
  }

  /** The pawn under a world point on the current layer, if any. */
  pick(wx: number, wy: number): Pawn | null {
    let best: Pawn | null = null, bestD = (TILE * 0.7) ** 2;
    for (const p of this.game.pawns.values()) {
      if (p.layer !== this.layer) continue;
      const pos = PawnRenderer.worldPos(p);
      const d = (pos.x - wx) ** 2 + (pos.y - wy) ** 2;
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }
}
