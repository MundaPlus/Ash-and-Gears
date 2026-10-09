/**
 * Draws survivors with smooth movement between tiles and small procedural motion
 * (walk bob, facing flip, sleeping pose). No frame animation (spec 09).
 */
import { Container, Graphics, Sprite, Text } from "pixi.js";
import { PALETTES, SHIRTS, t } from "@wc/data";
import { pain, type Game, type Pawn } from "@wc/sim";
import { TILE, type TextureSet } from "./textures.ts";

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
    if (p.faction === "colony") return this.tex.survivors[p.id % this.tex.survivors.length];
    const creature = this.game.reg.content.creatures[p.creature];
    if (creature.behavior === "human") return this.tex.raider;
    return this.tex.creatures[creature.id] ?? this.tex.raider;
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
    const labelColor = p.faction === "colony" ? 0xefd8a4 : 0xff8a70;
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
    return { root, body, label, zzz, flag, hp };
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
        v.body.y = 5;
        v.zzz.visible = false;
      } else if (p.asleep) {
        v.body.rotation = -Math.PI / 2;
        v.body.y = 4;
        v.zzz.visible = true;
        v.zzz.alpha = 0.5 + 0.5 * Math.sin(timeSec * 2 + p.id);
      } else {
        v.body.rotation = 0;
        v.zzz.visible = false;
        // Walk bob: two hops per tile-ish; idle breathing is a smaller wave.
        v.body.y = moving ? -Math.abs(Math.sin(timeSec * 10 + p.id)) * 3 : Math.sin(timeSec * 2 + p.id) * 0.6;
      }
      v.body.scale.x = Math.abs(v.body.scale.x) * p.facing * sz;
      v.flag.visible = p.drafted;
      // Health bar: shows when hurt.
      const hurt = Math.min(1, p.health.bloodLoss + pain(this.game, p));
      v.hp.clear();
      if (hurt > 0.05 || p.faction !== "colony") {
        v.hp.rect(-10, -20, 20, 3).fill({ color: 0x1b1714, alpha: 0.8 });
        v.hp.rect(-10, -20, 20 * (1 - hurt), 3).fill(p.faction === "colony" ? 0x9fb84a : 0xc2453a);
      }
      v.body.alpha = p.mentalBreak ? 0.75 : 1;
      v.label.visible = zoom > 0.55;
      const name = p.faction === "wild" ? t(`creature.${p.nick}`) : p.nick;
      v.label.text = p.mentalBreak ? t("pawn.sulking", { name }) : p.health.downed ? t("pawn.downed_label", { name }) : name;
      if (p.id === this.selected) {
        this.ring.visible = true;
        this.ring.position.set(pos.x, pos.y + 4);
      }
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
