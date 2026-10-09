/**
 * Farming (spec 04, "Farming"). Grow zones hold one crop type. Survivors sow empty tiles and
 * harvest ripe plants. Growth needs fertile ground and warmth. Crops sown in contaminated outdoor
 * soil, or standing outside during a radiation cloud, give contaminated food.
 */
import { isReserved } from "./ai.ts";
import { registerWorkGiver } from "./jobs.ts";
import type { Game } from "./game.ts";
import { dropItems } from "./items.ts";
import { NO_THING } from "./map.ts";
import type { Pawn } from "./pawn.ts";
import { skillLevel } from "./pawn.ts";
import { isRoofed, tempAt } from "./rooms.ts";
import { registerTask, workJob } from "./work.ts";
import { isContaminatedThing } from "./weather.ts";

const GROW_EVERY = 60;
export const SOW_WORK = 40;
/** Ripe crops are harvested at this growth. */
const RIPE = 1;

export function fertilityAt(game: Game, layer: number, x: number, y: number): number {
  const L = game.map.layers[layer];
  const i = L.i(x, y);
  if (L.floor[i]) return 0;
  return game.reg.terrain.list[L.terrain[i]].fertility;
}

export function tickFarming(game: Game): void {
  if (game.tick % GROW_EVERY !== 0) return;
  const dtDays = GROW_EVERY / game.ticksPerDay;
  for (const t of game.things.values()) {
    const crop = game.reg.things.list[t.def].crop;
    if (!crop || (t.growth ?? 0) >= RIPE) continue;
    if (tempAt(game, t.layer, t.x, t.y) < crop.minTemp) continue;
    const before = t.growth ?? 0;
    t.growth = Math.min(RIPE, before + (dtDays / crop.growDays) * fertilityAt(game, t.layer, t.x, t.y));
    // Redraw at a few growth steps so plants visibly grow.
    if (Math.floor(before * 4) !== Math.floor(t.growth * 4)) game.map.layers[t.layer].touch(t.x, t.y);
  }
}

registerTask("sow", {
  skill: "farming",
  xp: 0.4,
  total: () => SOW_WORK,
  valid: (game, job) => {
    const t = job.target!;
    const L = game.map.layers[t.layer];
    return L.thing[L.i(t.x, t.y)] === NO_THING && L.blueprint[L.i(t.x, t.y)] === NO_THING;
  },
  complete: (game, _p, job) => {
    const t = job.target!;
    const plant = game.spawnThing(job.data!.crop as string, t.layer, t.x, t.y);
    plant.growth = 0;
    if (t.layer === 0 && !isRoofed(game, 0, t.x, t.y) && game.soilContamUntil > game.tick) plant.contamUntil = game.soilContamUntil;
  },
});

registerTask("harvest", {
  skill: "farming",
  xp: 0.4,
  total: (game, job) => game.thingDefAt(job.target!.layer, job.target!.x, job.target!.y)?.work ?? 1,
  valid: (game, job) => {
    const t = job.target!;
    const L = game.map.layers[t.layer];
    const th = L.thing[L.i(t.x, t.y)];
    return th !== NO_THING && (game.things.get(th)!.growth ?? 0) >= RIPE;
  },
  complete: (game, p, job) => {
    const t = job.target!;
    const L = game.map.layers[t.layer];
    const thing = game.things.get(L.thing[L.i(t.x, t.y)])!;
    const def = game.reg.things.list[thing.def];
    const cont = isContaminatedThing(game, thing);
    const until = thing.contamUntil;
    game.removeThing(thing.id);
    const mult = 0.7 + skillLevel(game, p, "farming") * 0.03;
    for (const [item, n] of Object.entries(def.crop!.yield)) dropItems(game, item, Math.max(1, Math.round(n * mult)), t.layer, t.x, t.y, cont, until);
  },
});

function growJob(game: Game, p: Pawn) {
  type Cand = { layer: number; x: number; y: number; d: number; task: "sow" | "harvest"; crop?: string };
  const cands: Cand[] = [];
  for (const z of game.zones.values()) {
    if (z.kind !== "grow" || !z.crop) continue;
    const L = game.map.layers[z.layer];
    const crop = game.reg.things.get(z.crop).crop!;
    for (let i = 0; i < L.zone.length; i++) {
      if (L.zone[i] !== z.id) continue;
      const x = i % L.w, y = Math.floor(i / L.w);
      if (isReserved(game, `tile:${z.layer},${x},${y}`, p)) continue;
      const th = L.thing[i];
      let task: Cand["task"] | null = null;
      if (th !== NO_THING) {
        const thing = game.things.get(th)!;
        if (game.reg.things.list[thing.def].crop && (thing.growth ?? 0) >= RIPE) task = "harvest";
      } else if (L.blueprint[i] === NO_THING && L.item[i] === NO_THING && tempAt(game, z.layer, x, y) >= crop.minTemp) task = "sow";
      if (!task) continue;
      // Harvest first: ripe food is worth more than a new seed.
      const d = (x - p.x) ** 2 + (y - p.y) ** 2 + (z.layer !== p.layer ? 900 : 0) - (task === "harvest" ? 10000 : 0);
      cands.push({ layer: z.layer, x, y, d, task, crop: z.crop });
    }
  }
  cands.sort((a, b) => a.d - b.d);
  for (const c of cands.slice(0, 12)) {
    const pos = { layer: c.layer, x: c.x, y: c.y };
    if (!game.path.canReachAdjacent(p, pos)) continue;
    const job = workJob(game, p, c.task, pos);
    if (job) {
      if (c.crop) job.data!.crop = c.crop;
      return job;
    }
  }
  return null;
}

registerWorkGiver({ workType: "grow", give: (game, p) => growJob(game, p) });
