/**
 * Bills: recipes done at benches (stove, campfire, well, workbench).
 * Each recipe has a "keep this many in stock" target. A survivor gathers the inputs one stack at a
 * time, carries them to the bench, works, and drops the product next to the bench.
 * The auto-crafter in M6 uses the same recipes without a survivor.
 */
import type { RecipeDef } from "@wc/data";
import { atGoal, findItem, goTo, reserve } from "./ai.ts";
import { registerCleanup, registerJob, registerWorkGiver } from "./jobs.ts";
import type { Game } from "./game.ts";
import { countItems, dropItems } from "./items.ts";
import type { Thing } from "./map.ts";
import { pickUp } from "./hauling.ts";
import { learn, workSpeed, skillLevel, type Job, type Pawn } from "./pawn.ts";
import type { WorkType } from "./worktypes.ts";
import { isContaminatedThing } from "./weather.ts";

/** Which work type does a recipe belong to? */
export function recipeWorkType(r: RecipeDef): WorkType {
  if (r.skill === "cooking") return "cook";
  if (r.skill === "crafting" || r.skill === "technology") return "craft";
  return "haul";
}

export function billTarget(game: Game, bench: Thing, r: RecipeDef): number {
  const own = game.billTargets.get(`${bench.id}:${r.id}`);
  if (own !== undefined) return own;
  return r.target * (r.perColonist ? Math.max(1, game.pawns.size) : 1);
}

export function setBillTarget(game: Game, benchId: number, recipeId: string, n: number): void {
  game.billTargets.set(`${benchId}:${recipeId}`, Math.max(0, Math.round(n)));
}

export function recipesFor(game: Game, benchDefId: string): RecipeDef[] {
  return game.reg.content.recipes.filter((r) => r.benches.includes(benchDefId) && (!r.research || game.research.done.has(r.research)));
}

/** Units in stock of the recipe's first output (on the ground anywhere, not carried). */
export function stockOf(game: Game, r: RecipeDef): number {
  const [item] = Object.keys(r.output);
  return countItems(game, item);
}

export function matchesInput(game: Game, input: RecipeDef["inputs"][number], defIdx: number): boolean {
  const d = game.reg.items.list[defIdx];
  if (input.item) return d.id === input.item;
  if (input.tag === "raw_food") return d.raw;
  return false;
}

function benchWorkSpeed(game: Game, p: Pawn, r: RecipeDef): number {
  return r.skill ? workSpeed(game, p) * (0.4 + 0.06 * skillLevel(game, p, r.skill)) : workSpeed(game, p);
}

/** Give a bill job of this work type, if any bench needs one done. */
function billJob(game: Game, p: Pawn, workType: WorkType): Job | null {
  const benches = [...game.things.values()]
    .filter((t) => game.reg.things.list[t.def].bench)
    .sort((a, b) => (a.x - p.x) ** 2 + (a.y - p.y) ** 2 - ((b.x - p.x) ** 2 + (b.y - p.y) ** 2));
  for (const bench of benches) {
    const def = game.reg.things.list[bench.def];
    for (const r of recipesFor(game, def.id)) {
      if (recipeWorkType(r) !== workType) continue;
      if (stockOf(game, r) >= billTarget(game, bench, r)) continue;
      if (!game.path.canReachAdjacent(p, bench)) continue;
      // All inputs must exist somewhere before starting.
      const enough = r.inputs.every((inp) => {
        let n = 0;
        for (const s of game.items.values()) if (s.layer >= 0 && !s.contaminated && matchesInput(game, inp, s.def)) n += s.count;
        return n >= inp.count;
      });
      if (!enough) continue;
      if (!reserve(game, `thing:${bench.id}`, p)) continue;
      return { kind: "bill", stage: 0, targetId: bench.id, data: { recipe: r.id, input: 0, have: 0, work: r.work } };
    }
  }
  return null;
}

for (const wt of ["cook", "craft", "haul"] as WorkType[]) registerWorkGiver({ workType: wt, give: (game, p) => billJob(game, p, wt) });

/** Inputs still missing for the current input slot. */
function missingNow(r: RecipeDef, job: Job): number {
  const idx = job.data!.input as number;
  return idx < r.inputs.length ? r.inputs[idx].count - (job.data!.have as number) : 0;
}

/** Walk to the nearest stack for the current input. Returns false if none can be found. */
function fetchNext(game: Game, p: Pawn, r: RecipeDef, job: Job): boolean {
  const inp = r.inputs[job.data!.input as number];
  const src = findItem(game, p, (d, cont) => !cont && matchesInput(game, inp, d) && (!p.carrying || p.carrying.def === d));
  if (src === null || !reserve(game, `item:${src}`, p)) return false;
  job.data!.src = src;
  return goTo(game, p, game.items.get(src)!);
}

/**
 * Stages: 0 walking to an input stack, 1 walking to the bench with inputs, 2 working.
 * job.data: recipe, input (slot index), have (count in slot), u<itemIdx> (units used, for refunds).
 */
registerJob("bill", (game, p, job) => {
  const bench = game.things.get(job.targetId!);
  const r = game.reg.content.recipes.find((x) => x.id === job.data!.recipe)!;
  if (!bench) return "fail";

  if (job.stage === 0) {
    if (job.data!.src === undefined) {
      // Skip filled slots; when all are filled, start working.
      while ((job.data!.input as number) < r.inputs.length && missingNow(r, job) <= 0) {
        job.data!.input = (job.data!.input as number) + 1;
        job.data!.have = 0;
      }
      if ((job.data!.input as number) >= r.inputs.length) {
        if (!goTo(game, p, bench, true)) return "fail";
        job.stage = 2;
        return "run";
      }
      return fetchNext(game, p, r, job) ? "run" : "fail";
    }
    if (!atGoal(p)) return "run";
    const got = pickUp(game, p, job.data!.src as number, missingNow(r, job) - (p.carrying?.count ?? 0));
    game.reservations.delete(`item:${job.data!.src}`);
    delete job.data!.src;
    if (got <= 0 && !p.carrying) return "fail";
    // Need more of the same item? Pick up another stack first, if there is one.
    if ((p.carrying?.count ?? 0) < missingNow(r, job) && fetchNext(game, p, r, job)) return "run";
    if (!goTo(game, p, bench, true)) return "fail";
    job.stage = 1;
    return "run";
  }

  if (job.stage === 1) {
    if (!atGoal(p)) return "run";
    if (p.carrying) {
      const n = Math.min(p.carrying.count, missingNow(r, job));
      job.data!.have = (job.data!.have as number) + n;
      const k = `u${p.carrying.def}`;
      job.data![k] = ((job.data![k] as number) ?? 0) + n;
      p.carrying.count -= n;
      if (p.carrying.count <= 0) p.carrying = null;
    }
    job.stage = 0;
    return "run";
  }

  if (!atGoal(p)) return "run";
  if (bench.x !== p.x) p.facing = bench.x > p.x ? 1 : -1;
  job.data!.work = (job.data!.work as number) - benchWorkSpeed(game, p, r);
  if (r.skill) learn(game, p, r.skill, 0.4);
  if ((job.data!.work as number) > 0) return "run";
  // Water from a contaminated well is contaminated too.
  const cont = isContaminatedThing(game, bench);
  for (const [item, n] of Object.entries(r.output)) dropItems(game, item, n, p.layer, p.x, p.y, cont, bench.contamUntil);
  job.data!.done = true;
  return "done";
});

/** If a bill job ends early, put the used inputs back on the ground. */
registerCleanup("bill", (game, p, job) => {
  if (job.data?.done) return;
  for (const [k, v] of Object.entries(job.data ?? {})) {
    if (!k.startsWith("u") || typeof v !== "number" || v <= 0) continue;
    dropItems(game, Number(k.slice(1)), v, p.layer, p.x, p.y);
  }
});
