/**
 * Palette swap. Reads the indexed pixel_data that texel.ts saved for the paint
 * palette and writes the same sprite in every other palette of the manifest.
 *
 * Usage: npx tsx tools/art/recolor.ts <manifest.json> <out-dir>
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { encodePng } from "./png.ts";

const [manifestPath, outDir] = process.argv.slice(2);
if (!manifestPath || !outDir) {
  console.error("usage: recolor.ts <manifest.json> <out-dir>");
  process.exit(2);
}
const m = JSON.parse(readFileSync(manifestPath, "utf8")) as {
  paintPalette: string;
  palettes: Record<string, string[]>;
};
const src = join(outDir, m.paintPalette);
let count = 0;
for (const size of existsSync(src) ? readdirSync(src) : []) {
  for (const f of readdirSync(join(src, size)).filter((n) => n.endsWith(".json"))) {
    const meta = JSON.parse(readFileSync(join(src, size, f), "utf8"));
    for (const [name, colors] of Object.entries(m.palettes)) {
      if (name === m.paintPalette) continue;
      const dir = join(outDir, name, size);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, f.replace(/\.json$/, ".png")), encodePng(meta.pixel_data, colors));
      count++;
    }
  }
}
console.log(`wrote ${count} recolored sprites`);
