/**
 * "Salvage Print" style samples (next phase, S1): a page for the style review before mass production.
 * Shows a small scene in the three ink sets, people in four facings and walking, and single things.
 */
import { INK_SETS, Print, type Ink } from "./render/print/kit.ts";
import { battery, bed, bench, conveyor, person, PERSON_HEADROOM, RAIDER, SURVIVOR, terrain, wall, type Facing, type Look } from "./render/print/sprites.ts";

const root = document.getElementById("samples")!;

function canvas(wTiles: number, hTiles: number, px: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const cv = document.createElement("canvas");
  cv.width = wTiles * px;
  cv.height = hTiles * px;
  return [cv, cv.getContext("2d")!];
}

/** Draw `fn` with its origin at tile (tx, ty). */
function at(ctx: CanvasRenderingContext2D, inks: Record<Ink, string>, px: number, tx: number, ty: number, seed: number, fn: (p: Print) => void) {
  ctx.save();
  ctx.translate(tx * px, ty * px);
  fn(new Print(ctx, inks, px / 64, seed));
  ctx.restore();
}

function figure(parent: HTMLElement, cv: HTMLCanvasElement, caption: string) {
  const f = document.createElement("figure");
  f.append(cv);
  const c = document.createElement("figcaption");
  c.textContent = caption;
  f.append(c);
  parent.append(f);
}

function section(title: string, text: string): HTMLElement {
  const h = document.createElement("h2");
  h.textContent = title;
  const p = document.createElement("p");
  p.textContent = text;
  const row = document.createElement("div");
  row.className = "row";
  root.append(h, p, row);
  return row;
}

/** A small corner of a colony: walls, a bed, a bench, a battery, a belt, two survivors and a raider. */
function scene(inks: Record<Ink, string>, px: number): HTMLCanvasElement {
  const W = 10, H = 7;
  const [cv, ctx] = canvas(W, H, px);
  at(ctx, inks, px, 0, 0, 7, (p) => terrain(p, W, H, 11));
  const walls = new Set<string>();
  for (let x = 1; x <= 6; x++) walls.add(`${x},1`);
  for (let y = 1; y <= 5; y++) walls.add(`1,${y}`);
  const isWall = (x: number, y: number) => walls.has(`${x},${y}`);
  for (const k of walls) {
    const [x, y] = k.split(",").map(Number);
    at(ctx, inks, px, x, y, x * 31 + y, (p) => wall(p, isWall(x, y - 1), isWall(x + 1, y), isWall(x, y + 1), isWall(x - 1, y)));
  }
  at(ctx, inks, px, 2, 2, 3, (p) => bed(p));
  at(ctx, inks, px, 4, 2, 4, (p) => bench(p));
  at(ctx, inks, px, 6, 3, 5, (p) => battery(p, 0.75));
  for (let x = 5; x <= 9; x++) at(ctx, inks, px, x, 6, 20 + x, (p) => conveyor(p, (x * 3) % 8));
  at(ctx, inks, px, 3, 4, 41, (p) => person(p, "S", 0, SURVIVOR));
  at(ctx, inks, px, 7.4, 4.2, 42, (p) => person(p, "E", 1, { ...SURVIVOR, coat: "ochre", coatDark: "ochreDark", cap: "teal", tool: "rifle" }));
  at(ctx, inks, px, 8.6, 2, 43, (p) => person(p, "W", 2, RAIDER));
  return cv;
}

const head = document.createElement("div");
head.innerHTML =
  "<h1>Salvage Print</h1><p>Style samples for Ash &amp; Gears (next phase, S1). Everything here is drawn in code: a few flat inks, halftone dots for shade, color a little off the outline like a cheap two-color print, and a wobbly soot-black ink line. Things are seen from straight above; people from a high three-quarter angle, with arms, tools and a pack. The 16 px pixel style stays as an option.</p>";
root.append(head);

const scenes = section("A corner of a colony", "The same scene in the three ink sets (they replace the pixel palettes).");
for (const set of ["rust", "ash", "toxic"]) figure(scenes, scene(INK_SETS[set], 72), `Ink set: ${set}`);

const inks = INK_SETS.rust;
const ppl = section("People", "Four facings, then two walking steps. Survivors wear goggles pushed up on the cap and carry a pack with a rolled blanket; raiders have spiked shoulder pads, a gas mask and a mohawk.");
for (const [look, name] of [[SURVIVOR, "Survivor"], [RAIDER, "Raider"]] as [Look, string][])
  for (const f of ["S", "E", "N", "W"] as Facing[]) {
    const [cv, ctx] = canvas(1, 1 + PERSON_HEADROOM, 160);
    at(ctx, inks, 160, 0, PERSON_HEADROOM, 9, (p) => person(p, f, 0, look));
    figure(ppl, cv, `${name} · ${f}`);
  }
for (const fr of [1, 2]) {
  const [cv, ctx] = canvas(1, 1 + PERSON_HEADROOM, 160);
  at(ctx, inks, 160, 0, PERSON_HEADROOM, 9, (p) => person(p, "E", fr, SURVIVOR));
  figure(ppl, cv, `Walking · step ${fr}`);
}

const things = section("Things", "Top-down, with a halftone cast shadow. Walls show their top and, on the open south side, their front face.");
{
  const [cv, ctx] = canvas(3, 3, 96);
  const ws = new Set(["0,0", "1,0", "2,0", "0,1", "0,2"]);
  const w = (x: number, y: number) => ws.has(`${x},${y}`);
  at(ctx, inks, 96, 0, 0, 1, (p) => terrain(p, 3, 3, 5));
  for (const k of ws) {
    const [x, y] = k.split(",").map(Number);
    at(ctx, inks, 96, x, y, x + y * 7, (p) => wall(p, w(x, y - 1), w(x + 1, y), w(x, y + 1), w(x - 1, y)));
  }
  figure(things, cv, "Wall corner");
}
for (const [w, h, name, fn] of [
  [2, 2, "Bed", (p: Print) => bed(p)],
  [2, 1, "Workbench", (p: Print) => bench(p)],
  [1, 2, "Battery · full", (p: Print) => battery(p, 1)],
  [1, 2, "Battery · low", (p: Print) => battery(p, 0.25)],
] as [number, number, string, (p: Print) => void][]) {
  const [cv, ctx] = canvas(w, h, 96);
  at(ctx, inks, 96, 0, 0, 3, fn);
  figure(things, cv, name);
}
{
  const [cv, ctx] = canvas(4, 1, 96);
  for (let x = 0; x < 4; x++) at(ctx, inks, 96, x, 0, x, (p) => conveyor(p, x * 2));
  figure(things, cv, "Conveyor line (ribs move along the belt)");
}

const ground = section("Ground", "Dirt with darker patches, pebbles and cracks; a sand drift; all as print tones, no gradients.");
{
  const [cv, ctx] = canvas(6, 3, 80);
  at(ctx, inks, 80, 0, 0, 2, (p) => terrain(p, 6, 3, 23));
  figure(ground, cv, "Dirt and sand");
}
