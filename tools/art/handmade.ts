/**
 * Hand-pixeled 16 px sample sprites, drawn as palette-index grids by Claude.
 * A second sample source next to texel-studio, so the art choice does not wait on the shared GPU.
 * Grid chars: "." = transparent, 0-9 and a-f = palette index 0-15 (palette roles in samples.json).
 * 32 px versions are made with Scale2x (EPX), a standard pixel-art upscaler.
 *
 * Usage: npx tsx tools/art/handmade.ts <manifest.json> <out-dir>
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { encodePng } from "./png.ts";

// Roles: 0-7 neutral ramp (0 outline), 8-10 rust/orange, 11-12 plants, 13-14 metal, 15 glow.
export const SPRITES: Record<string, string[]> = {
  survivor: [
    "................",
    "......0000......",
    ".....033330.....",
    "....03344330....",
    "....03555530....",
    "....05050505....",
    ".....055550.....",
    "......0ed0......",
    "....00a99a00....",
    "...0c9a99a9c0...",
    "...0c999999c0...",
    "...05c9999c50...",
    "....0c1111c0....",
    ".....011110.....",
    ".....01.010.....",
    ".....00..00.....",
  ],
  raider: [
    "................",
    "......0000......",
    "....00811800....",
    "...0811111180...",
    "...0e000000e0...",
    "....01f11f10....",
    ".....011110.....",
    "..000.0000.000..",
    ".00e0899998e0d..",
    ".00e0988889e0d..",
    "..00.988889.d...",
    "....05988895d...",
    "....0d1111d0....",
    ".....011110.....",
    ".....01.010.....",
    ".....00..00.....",
  ],
  glow_hound: [
    "................",
    "................",
    "................",
    "..........0000..",
    ".........033300.",
    "..00....0334f30.",
    ".0300000033333e0",
    ".03333f3333330..",
    "..0333333f33330.",
    "..03f33333333.0.",
    "..0333333333330.",
    "...030.....030..",
    "...030.....030..",
    "...030.....030..",
    "...00......00...",
    "................",
  ],
  dirt: [
    "3333433333433333",
    "3343333323333433",
    "3333333333333333",
    "4333323333332333",
    "3333333353333333",
    "3332333333333334",
    "3333333334333333",
    "3433333333333233",
    "3333233333333333",
    "3333333433333333",
    "3333333333233334",
    "3533333333333333",
    "3333334333333333",
    "3333333333353333",
    "3233333333333323",
    "3333343333333333",
  ],
  scrap_wall: [
    "0000000000000000",
    "0aa9aa9aa9aa9aa0",
    "09e99e99e99e99e0",
    "0aa9aa9aa9aa9aa0",
    "0a99a99a99a99a90",
    "0aa9aa9aa9aa9aa0",
    "0000000000000000",
    "08a98a98a98a98a0",
    "0899899e9989e980",
    "0898898989898980",
    "08a98a98a98a98a0",
    "0898898989898980",
    "0000000000000000",
    "0888888888888880",
    "0811111111111180",
    "0000000000000000",
  ],
  rubble: [
    "................",
    "................",
    "................",
    ".......00.......",
    "......0e.0......",
    ".....00e000.....",
    "....0665e5600...",
    "...065554655500.",
    "..06554006545550",
    "..05540e05445550",
    ".0655455544e5540",
    ".05544544e544440",
    "0544444444444430",
    "0444333333333330",
    ".00000000000000.",
    "................",
  ],
  generator: [
    "................",
    ".....0000.......",
    ".....0dd0...00..",
    "..0000dd0000a0..",
    ".0eeeeeeeeee0...",
    ".0e00000000e0...",
    ".0e0eeeeee0e000.",
    ".0e0e0e0e0e0990.",
    ".0e0eeeeee0e0a0.",
    ".0e00000000e0990",
    ".0eeeeeeeeee0990",
    ".0dddddddddd0000",
    ".0d0dddddd0d0...",
    ".00000000000....",
    "................",
    "................",
  ],
  conveyor: [
    "0000000000000000",
    "deeeeeeeeeeeeeed",
    "d0d0d0d0d0d0d0d0",
    "0000000000000000",
    "1111111111111111",
    "1212212212212212",
    "1111111111111111",
    "1121121121121121",
    "1111111111111111",
    "1212212212212212",
    "1111111111111111",
    "1121121121121121",
    "0000000000000000",
    "d0d0d0d0d0d0d0d0",
    "deeeeeeeeeeeeeed",
    "0000000000000000",
  ],
  glowcorn: [
    "................",
    ".......0........",
    "......0c0.......",
    "...0..0c0..0....",
    "..0c0.0c0.0c0...",
    "..0c00fff00c0...",
    "...0c0fff0c0....",
    "....0cfff0c.....",
    "...0c0fff0c0....",
    "..0c0.fff.0c0...",
    "...0..0c0..0....",
    "......0c0.......",
    "......0c0.......",
    ".....0bcb0......",
    ".....033330.....",
    "......0000......",
  ],
  canned_food: [
    "................",
    "................",
    "................",
    ".....000000.....",
    "....0edddde0....",
    "....0eeeeee0....",
    "....0e0000e0....",
    "....0a9999a0....",
    "....0a6666a0....",
    "....0a6556a0....",
    "....0a6666a0....",
    "....0a9999a0....",
    "....0e0000e0....",
    "....0edddde0....",
    ".....000000.....",
    "................",
  ],
  water_jug: [
    "................",
    "................",
    "......000.......",
    ".....0660.......",
    ".....0000.000...",
    "....077770070...",
    "...0777777000...",
    "...07777777e0...",
    "...0eeeeeeee0...",
    "...0dddddddd0...",
    "...0dcddddcd0...",
    "...0dddddddd0...",
    "...0dddcdddd0...",
    "....0dddddd0....",
    ".....000000.....",
    "................",
  ],
};

export function parse(rows: string[]): number[][] {
  return rows.map((r) => [...r].map((c) => (c === "." || c === " " ? -1 : parseInt(c, 16))));
}

/** Scale2x / EPX: doubles a sprite and smooths diagonal edges without new colors. */
export function scale2x(src: number[][]): number[][] {
  const h = src.length, w = src[0].length;
  const at = (x: number, y: number) => src[Math.max(0, Math.min(h - 1, y))][Math.max(0, Math.min(w - 1, x))];
  const out = Array.from({ length: h * 2 }, () => new Array<number>(w * 2).fill(-1));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const p = at(x, y), a = at(x, y - 1), b = at(x + 1, y), c = at(x - 1, y), d = at(x, y + 1);
      let e0 = p, e1 = p, e2 = p, e3 = p;
      if (c === a && c !== d && a !== b) e0 = a;
      if (a === b && a !== c && b !== d) e1 = b;
      if (d === c && d !== b && c !== a) e2 = c;
      if (b === d && b !== a && d !== c) e3 = d;
      out[y * 2][x * 2] = e0;
      out[y * 2][x * 2 + 1] = e1;
      out[y * 2 + 1][x * 2] = e2;
      out[y * 2 + 1][x * 2 + 1] = e3;
    }
  return out;
}

if (process.argv[1]?.endsWith("handmade.ts")) {
  const [manifestPath, outDir] = process.argv.slice(2);
  const m = JSON.parse(readFileSync(manifestPath, "utf8")) as { palettes: Record<string, string[]> };
  let n = 0;
  for (const [id, rows] of Object.entries(SPRITES)) {
    if (rows.length !== 16 || rows.some((r) => r.length !== 16)) throw new Error(`${id}: rows must be 16x16 (got ${rows.map((r) => r.length).join(",")})`);
    const px16 = parse(rows);
    const px32 = scale2x(px16);
    for (const [pal, colors] of Object.entries(m.palettes)) {
      for (const [size, px] of [["16", px16], ["32", px32]] as const) {
        const dir = join(outDir, pal, size);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, `${id}.png`), encodePng(px, colors));
        writeFileSync(join(dir, `${id}.json`), JSON.stringify({ id, size: Number(size), palette: pal, colors, pixel_data: px, source: "handmade" }));
        n++;
      }
    }
  }
  console.log(`wrote ${n} hand-made sprites`);
}
