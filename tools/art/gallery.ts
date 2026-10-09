/**
 * Build the art-sample gallery page from <out-dir>/<palette>/<size>/<id>.png.
 * Images are embedded as data URIs so the page is one self-contained file.
 *
 * Usage: npx tsx tools/art/gallery.ts <manifest.json> <page.html> <source>=<dir> [<source>=<dir> ...]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [manifestPath, pagePath, ...sourceArgs] = process.argv.slice(2);
const sources = sourceArgs.map((a) => a.split("=") as [string, string]);
const m = JSON.parse(readFileSync(manifestPath, "utf8")) as {
  sizes: number[];
  palettes: Record<string, string[]>;
  sprites: { id: string; type: string; prompt: string }[];
};

// images[source][palette][size][id] = data URI
const images: Record<string, Record<string, Record<string, Record<string, string>>>> = {};
const counts: Record<string, number> = {};
for (const [src, dir] of sources) {
  images[src] = {};
  counts[src] = 0;
  for (const p of Object.keys(m.palettes)) {
    images[src][p] = {};
    for (const size of m.sizes) {
      images[src][p][size] = {};
      for (const s of m.sprites) {
        const f = join(dir, p, String(size), `${s.id}.png`);
        if (!existsSync(f)) continue;
        images[src][p][size][s.id] = "data:image/png;base64," + readFileSync(f).toString("base64");
        counts[src]++;
      }
    }
  }
}
const data = {
  palettes: m.palettes,
  sizes: m.sizes,
  sprites: m.sprites.map((s) => ({ id: s.id, type: s.type, prompt: s.prompt })),
  images,
  sources: sources.map(([s]) => s),
  counts,
};

const html = readFileSync(new URL("./gallery.template.html", import.meta.url), "utf8").replace(
  "/*__DATA__*/null",
  JSON.stringify(data),
);
writeFileSync(pagePath, html);
console.log(`wrote ${pagePath} (${(html.length / 1024).toFixed(0)} KB)`);
