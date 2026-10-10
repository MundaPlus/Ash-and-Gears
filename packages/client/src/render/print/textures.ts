/**
 * "Salvage Print" textures (next phase, S2–S3). Builds on the pixel texture set: every texture that
 * has a print drawing is replaced; the rest keep their pixel look until it is drawn. People get four
 * facings and three walking frames each.
 */
import { Texture } from "pixi.js";
import type { Registry } from "@wc/sim";
import { INK_SETS, Print, type Ink } from "./kit.ts";
import { doorTile, floorTile, terrainEdgeTile, terrainTile, wallTile } from "./ground.ts";
import { battery, bed, bench, conveyor, person, PERSON_HEADROOM, RAIDER, type Facing, type Look } from "./sprites.ts";
import type { TextureSet } from "../textures.ts";

/** Texture pixels per tile. 80 keeps the halftone dot grid whole across tiles. */
const TEX = 80;
export const FACINGS: Facing[] = ["S", "E", "N", "W"];

/** Print looks per pixel look: coats, hair and caps from the same index the UI swatches use. */
const COATS: [Ink, Ink][] = [["rust", "rustDark"], ["teal", "tealDark"], ["slate", "slateDark"], ["ochre", "ochreDark"], ["tealDark", "soot"], ["rustDark", "soot"]];
const HAIRS: Ink[] = ["hair", "soot", "ochreDark", "slate", "rust"];
const CAPS: (Ink | null)[] = ["rust", "teal", "ochre", null];
const TOOLS: Look["tool"][] = ["wrench", null, "rifle", "wrench", null, "pipe"];

export function survivorLook(k: number): Look {
  const [coat, coatDark] = COATS[k % COATS.length];
  return { coat, coatDark, pants: k % 3 === 0 ? "slateDark" : k % 3 === 1 ? "ochreDark" : "soot", cap: CAPS[k % CAPS.length], hair: HAIRS[(k * 3) % HAIRS.length], tool: TOOLS[k % TOOLS.length] };
}

const RAIDER_LOOKS: Look[] = [RAIDER, { ...RAIDER, coat: "slateDark", coatDark: "soot", hair: "glow", tool: "rifle" }, { ...RAIDER, coat: "ochreDark", coatDark: "soot", hair: "bone", tool: "pipe" }];

/** People textures: [look][facing S E N W][frame 0 stand, 1, 2 steps]. */
export interface PrintPeople {
  survivors: Texture[][][];
  raiders: Texture[][][];
  /** Extra height above the tile, in tiles (heads and crests). */
  headroom: number;
}

function tex(w: number, h: number, inks: Record<Ink, string>, seed: number, draw: (p: Print) => void, offsetY = 0): Texture {
  const cv = document.createElement("canvas");
  cv.width = Math.round(w * TEX);
  cv.height = Math.round(h * TEX);
  const ctx = cv.getContext("2d")!;
  ctx.translate(0, offsetY * TEX);
  draw(new Print(ctx, inks, TEX / 64, seed));
  const t = Texture.from(cv);
  t.source.scaleMode = "linear";
  return t;
}

/** Things with a print drawing: id -> draw (local units, the thing's own footprint). */
const THINGS: Partial<Record<string, (p: Print) => void>> = {
  scrap_bed: (p) => bed(p),
  scrap_bench: (p) => bench(p),
  battery: (p) => battery(p, 0.75),
  conveyor: (p) => conveyor(p, 0),
};

/** Turn a drawing by quarter turns inside its footprint (w x h tiles before turning). */
function turned(w: number, h: number, rot: number, inks: Record<Ink, string>, seed: number, draw: (p: Print) => void): Texture {
  const [tw, th] = rot % 2 ? [h, w] : [w, h];
  const cv = document.createElement("canvas");
  cv.width = tw * TEX;
  cv.height = th * TEX;
  const ctx = cv.getContext("2d")!;
  ctx.translate((tw * TEX) / 2, (th * TEX) / 2);
  ctx.rotate((rot * Math.PI) / 2);
  ctx.translate((-w * TEX) / 2, (-h * TEX) / 2);
  draw(new Print(ctx, inks, TEX / 64, seed));
  const t = Texture.from(cv);
  t.source.scaleMode = "linear";
  return t;
}

/** Replace the pixel textures with print ones where a print drawing exists. */
export function applyPrint(set: TextureSet, reg: Registry, palette: string): TextureSet & { people: PrintPeople } {
  const inks = INK_SETS[palette] ?? INK_SETS.rust;
  const terrain = reg.terrain.list.map((d, i) => Array.from({ length: set.terrain[i].length }, (_, v) => tex(1, 1, inks, i * 7 + v, (p) => terrainTile(p, d.id, v))));
  const terrainEdges = reg.terrain.list.map((d, i) => [0, 1, 2, 3].map((dir) => tex(1, 1, inks, i * 11 + dir, (p) => terrainEdgeTile(p, d.id, dir))));
  const floors = reg.floors.list.map((d, i) => {
    let drawn = false;
    const t = tex(1, 1, inks, i, (p) => (drawn = floorTile(p, d.id)));
    return drawn ? t : set.floors[i];
  });
  const walls = reg.things.list.map((d, i) => {
    if (!set.walls[i]) return null;
    let ok = true;
    const masks = Array.from({ length: 16 }, (_, m) => tex(1, 1, inks, i * 16 + m, (p) => (ok = wallTile(p, d.id, !!(m & 1), !!(m & 2), !!(m & 4), !!(m & 8)) && ok)));
    return ok ? masks : set.walls[i];
  });
  const things = reg.things.list.map((d, i) => {
    if (d.door) return tex(1, 1, inks, i, (p) => doorTile(p, d.id));
    const draw = THINGS[d.id];
    return draw ? tex(d.footprint[0], d.footprint[1], inks, i, draw) : set.things[i];
  });
  const thingsRot = set.thingsRot.map((row, rot) =>
    row.map((t, i) => {
      const d = reg.things.list[i];
      const draw = THINGS[d.id];
      return rot && draw && !d.belt ? turned(d.footprint[0], d.footprint[1], rot, inks, i, draw) : t;
    }),
  );
  const thingsTurned = set.thingsTurned.map((t, i) => thingsRot[1][i] ?? t);
  const frames = (look: Look, seed: number) => FACINGS.map((f) => [0, 1, 2].map((fr) => tex(1, 1 + PERSON_HEADROOM, inks, seed, (p) => person(p, f, fr, look), PERSON_HEADROOM)));
  const people: PrintPeople = {
    survivors: set.survivors.map((_, k) => frames(survivorLook(k), 100 + k)),
    raiders: RAIDER_LOOKS.map((l, k) => frames(l, 200 + k)),
    headroom: PERSON_HEADROOM,
  };
  return { ...set, terrain, terrainEdges, floors, walls, things, thingsRot, thingsTurned, people };
}
