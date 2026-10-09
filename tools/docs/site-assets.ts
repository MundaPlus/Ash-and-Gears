/** Pixel-art images for the presentation page, made from the game's own art grids. */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CREATURES, ITEMS, PALETTES, parseGrid, SHIRTS, THINGS } from "../../packages/data/src/art/index.ts";
import { encodePng } from "../art/png.ts";

const out = process.argv[2] ?? "packages/client/public/site/img";
mkdirSync(out, { recursive: true });

const remap = (g: number[][], m: Record<number, number>) => g.map((r) => r.map((v) => (m[v] !== undefined ? m[v] : v)));

// Walkers for the hero strip.
const pal = PALETTES.rust;
writeFileSync(join(out, "survivor.png"), encodePng(parseGrid(CREATURES.survivor), pal));
writeFileSync(join(out, "survivor2.png"), encodePng(remap(parseGrid(CREATURES.survivor), { 8: SHIRTS[1][0], 9: SHIRTS[1][1], 10: SHIRTS[1][2] }), pal));
writeFileSync(join(out, "survivor3.png"), encodePng(remap(parseGrid(CREATURES.survivor), { 8: SHIRTS[2][0], 9: SHIRTS[2][1], 10: SHIRTS[2][2] }), pal));
writeFileSync(join(out, "raider.png"), encodePng(parseGrid(CREATURES.raider), pal));
writeFileSync(join(out, "hound.png"), encodePng(parseGrid(CREATURES.glow_hound), pal));
writeFileSync(join(out, "rat.png"), encodePng(parseGrid(CREATURES.rad_rat), pal));

// One sprite strip per palette, for the art style section.
const strip = ["survivor", "raider", "glow_hound", "scrap_wall", "stone_wall", "scrap_bed", "campfire", "scrap_generator", "lamp", "scrap_turret", "auto_crafter", "glowcorn_plant", "canned_food", "clean_water", "pipe_pistol", "factory_manual"];
const grids = strip.map((id) => parseGrid(CREATURES[id] ?? THINGS[id] ?? ITEMS[id]));
for (const [name, colors] of Object.entries(PALETTES)) {
  const rows = Array.from({ length: 16 }, (_, y) => grids.flatMap((g) => [...g[y], -1, -1]));
  writeFileSync(join(out, `strip-${name}.png`), encodePng(rows, colors));
}
// Pillar icons.
for (const id of ["scrap_bed", "auto_crafter", "scrap_turret", "canned_food"]) writeFileSync(join(out, `icon-${id}.png`), encodePng(parseGrid(THINGS[id] ?? ITEMS[id]), pal));
console.log(`site images in ${out}`);
