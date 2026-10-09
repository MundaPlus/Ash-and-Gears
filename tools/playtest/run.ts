/**
 * Headless playtest (spec 10): play N in-game days with the scripted player and print a report.
 * Usage: npm run playtest -- --seed 42 --days 30 [--story sheriff|grandma|chaos|none] [--size 200]
 * Exit code 1 if the colony died out or a tick took far too long.
 */
import { loadCoreContent } from "../../packages/data/src/index.ts";
import { countItems, Game, GOALS } from "../../packages/sim/src/index.ts";
import { makeAutoplayer } from "./autoplay.ts";

const args = process.argv.slice(2);
const arg = (k: string, d: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const seed = arg("seed", "playtest");
const days = Number(arg("days", "20"));
const story = arg("story", "sheriff") as "sheriff";
const size = Number(arg("size", "200"));

const game = Game.create(loadCoreContent(), { seed, mapSize: size, storyteller: story });
const act = makeAutoplayer(game);
let maxMs = 0, totalMs = 0, n = 0;
const rows: string[] = [];
const colonists = () => [...game.pawns.values()].filter((p) => p.faction === "colony");

for (let d = 0; d < days; d++) {
  for (let i = 0; i < game.ticksPerDay; i++) {
    act();
    const t0 = performance.now();
    game.step();
    const ms = performance.now() - t0;
    totalMs += ms;
    maxMs = Math.max(maxMs, ms);
    n++;
  }
  const cols = colonists();
  const mood = cols.length ? Math.round(cols.reduce((s, p) => s + p.mood, 0) / cols.length) : 0;
  const food = countItems(game, "canned_food") + countItems(game, "simple_meal") * 18 + game.reg.items.list.filter((x) => x.raw).reduce((s, x) => s + countItems(game, x.id), 0) / 20;
  const events = game.story.log.filter((e) => e.tick > game.tick - game.ticksPerDay).map((e) => e.event);
  rows.push(
    `day ${String(d + 1).padStart(2)} | alive ${cols.length} | mood ${String(mood).padStart(3)} | food~${Math.round(food).toString().padStart(3)} | water ${countItems(game, "clean_water").toString().padStart(3)} | built ${[...game.things.values()].filter((t) => game.reg.things.list[t.def].build).length.toString().padStart(3)} | research ${game.research.done.size} | ${events.join(",")}`,
  );
  if (!cols.length) break;
}

console.log(rows.join("\n"));
console.log("deaths:", game.deaths.filter((d) => d.faction === "colony").map((d) => `${d.name} (${d.cause}, day ${Math.floor(d.tick / game.ticksPerDay) + 1})`).join("; ") || "none");
console.log("enemies killed:", game.deaths.filter((d) => d.faction !== "colony").length, "· raids survived:", game.story.raidsSurvived);
console.log("goals:", GOALS.map((g) => `${g} ${game.goals[g] ? "yes" : "no"}`).join(", "));
console.log(`tick time: avg ${(totalMs / n).toFixed(3)} ms, max ${maxMs.toFixed(1)} ms over ${n} ticks`);
if (!colonists().length || maxMs > 250) process.exit(1);
