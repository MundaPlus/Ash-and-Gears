/**
 * Build the art-sample gallery page from <out-dir>/<palette>/<size>/<id>.png.
 * Images are embedded as data URIs so the page is one self-contained file.
 *
 * Usage: npx tsx tools/art/gallery.ts <manifest.json> <out-dir> <page.html>
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [manifestPath, outDir, pagePath] = process.argv.slice(2);
const m = JSON.parse(readFileSync(manifestPath, "utf8")) as {
  sizes: number[];
  palettes: Record<string, string[]>;
  sprites: { id: string; type: string; prompt: string }[];
};

// sprites[palette][size][id] = data URI
const sprites: Record<string, Record<string, Record<string, string>>> = {};
for (const p of Object.keys(m.palettes)) {
  sprites[p] = {};
  for (const size of m.sizes) {
    sprites[p][size] = {};
    for (const s of m.sprites) {
      const f = join(outDir, p, String(size), `${s.id}.png`);
      if (existsSync(f)) sprites[p][size][s.id] = "data:image/png;base64," + readFileSync(f).toString("base64");
    }
  }
}
const data = {
  palettes: m.palettes,
  sizes: m.sizes,
  sprites: m.sprites.map((s) => ({ id: s.id, type: s.type, prompt: s.prompt })),
  images: sprites,
};

const html = readFileSync(new URL("./gallery.template.html", import.meta.url), "utf8").replace(
  "/*__DATA__*/null",
  JSON.stringify(data),
);
writeFileSync(pagePath, html);
console.log(`wrote ${pagePath} (${(html.length / 1024).toFixed(0)} KB)`);
