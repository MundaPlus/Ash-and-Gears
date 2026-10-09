/** Check every hand-made sprite is 16x16 with valid characters, and list content ids without art. */
import { allSprites, CREATURES, FLOORS, ITEMS, THINGS } from "../../packages/data/src/art/index.ts";
import { loadCoreContent } from "../../packages/data/src/index.ts";

let bad = 0;
for (const [id, rows] of Object.entries(allSprites())) {
  const errs: string[] = [];
  if (rows.length !== 16) errs.push(`${rows.length} rows`);
  rows.forEach((r, i) => {
    if (r.length !== 16) errs.push(`row ${i} has ${r.length}`);
    if (/[^.0-9a-f]/.test(r)) errs.push(`row ${i} bad char`);
  });
  if (errs.length) {
    bad++;
    console.log(`${id}: ${errs.join("; ")}`);
  }
}
const c = loadCoreContent();
const missing = [
  ...c.things.filter((d) => !THINGS[d.id]).map((d) => `thing ${d.id}`),
  ...c.items.filter((d) => !ITEMS[d.id]).map((d) => `item ${d.id}`),
  ...c.floors.filter((d) => !FLOORS[d.id]).map((d) => `floor ${d.id}`),
  ...["survivor", "raider", "rad_rat", "glow_hound"].filter((k) => !CREATURES[k]).map((k) => `creature ${k}`),
];
console.log(`${bad} sprites with errors; missing art: ${missing.join(", ") || "none"}`);
process.exit(bad ? 1 : 0);
