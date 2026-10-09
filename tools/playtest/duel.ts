/** Fight odds: N survivors (start gear, drafted) vs a group, in the open. npx tsx tools/playtest/duel.ts <hound|rat|raid> <n> <runs> */
import { loadCoreContent } from "../../packages/data/src/index.ts";
import { Game, makeHostile, NO_THING, setDrafted } from "../../packages/sim/src/index.ts";
const [kind = "hound", nArg = "3", runsArg = "40"] = process.argv.slice(2);
const content = loadCoreContent();
let wins = 0, losses = 0, colDeadTotal = 0, colDownTotal = 0, foeDeadTotal = 0, ticksTotal = 0;
for (let r = 0; r < Number(runsArg); r++) {
  const g = Game.create(content, { seed: `duel${r}`, mapSize: 96, storyteller: "none" });
  const { x, y } = g.home;
  const L = g.map.layers[0];
  for (let yy = y - 15; yy <= y + 15; yy++) for (let xx = x - 15; xx <= x + 15; xx++) { const t = L.thing[L.i(xx, yy)]; if (t !== NO_THING) g.removeThing(t); g.setTerrain(0, xx, yy, "dirt"); }
  const cols = [...g.pawns.values()];
  cols.forEach((c) => setDrafted(g, c, true));
  const gid = g.newId();
  const n = Number(nArg);
  g.groups.set(gid, { id: gid, kind: kind === "raid" ? "raid" : kind === "rat" ? "rad_rats" : "glow_hounds", size: n, fleeing: false, arrived: g.tick });
  for (let i = 0; i < n; i++) {
    const creature = kind === "raid" ? "human" : kind === "rat" ? "rad_rat" : "glow_hound";
    const p = makeHostile(g, creature, kind === "raid" ? "raiders" : "wild", 0, x + 12, y - 2 + i * 2, gid, kind === "raid" ? ["pipe", "machete", "pipe_pistol"][i % 3] : null);
    g.pawns.set(p.id, p);
  }
  let t = 0;
  for (; t < g.ticksPerHour * 4; t++) {
    g.step();
    if (!g.groups.size) break;
  }
  ticksTotal += t;
  const colAlive = cols.filter((c) => g.pawns.has(c.id));
  const colDown = colAlive.filter((c) => c.health.downed).length;
  colDeadTotal += cols.length - colAlive.length;
  colDownTotal += colDown;
  foeDeadTotal += g.deaths.filter((d) => d.faction !== "colony").length;
  if (colAlive.length - colDown > 0) wins++;
  else losses++;
}
console.log(`${kind} x${nArg} vs 3 survivors: survivors win ${wins}, lose ${losses} · avg dead ${(colDeadTotal / Number(runsArg)).toFixed(2)}, down ${(colDownTotal / Number(runsArg)).toFixed(2)} · foes killed ${(foeDeadTotal / Number(runsArg)).toFixed(2)} · avg ${(ticksTotal / Number(runsArg) / 20).toFixed(0)} s`);
