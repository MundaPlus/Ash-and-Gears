/** Contact sheet of all hand-made sprites + terrain: npx tsx tools/art/sheet.ts <out.png> [palette] [scale] */
import { writeFileSync } from "node:fs";
import { allSprites, PALETTES, parseGrid, terrainGrid } from "../../packages/data/src/art/index.ts";
import { loadCoreContent } from "../../packages/data/src/index.ts";
import { encodePng } from "./png.ts";

const [out, pal = "rust", scaleArg = "4"] = process.argv.slice(2);
const scale = Number(scaleArg);
const grids = [
  ...loadCoreContent().terrain.map((t) => terrainGrid(t.id, 0)),
  ...Object.values(allSprites()).map(parseGrid),
];
const cols = 12, cell = 16 * scale + 4;
const rows = Math.ceil(grids.length / cols);
const W = cols * cell, H = rows * cell;
// Background index 2 so outlines show; checker for transparency drawn as -1 then filled.
const img: number[][] = Array.from({ length: H }, () => new Array(W).fill(-1));
grids.forEach((g, k) => {
  const ox = (k % cols) * cell + 2, oy = Math.floor(k / cols) * cell + 2;
  for (let y = 0; y < 16 * scale; y++) for (let x = 0; x < 16 * scale; x++) img[oy + y][ox + x] = g[Math.floor(y / scale)][Math.floor(x / scale)];
});
// Transparent shows as a mid grey: use a palette with an extra entry.
const colors = [...PALETTES[pal], "#5a5a5a"];
writeFileSync(out, encodePng(img.map((r) => r.map((v) => (v < 0 ? 16 : v))), colors));
console.log(`${grids.length} sprites -> ${out}`);
