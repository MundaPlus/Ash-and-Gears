/**
 * Bills: recipes done at benches (stove, campfire, well, workbench).
 * Each recipe has a "keep this many in stock" target. A survivor gathers the inputs one stack at a
 * time, carries them to the bench, works, and drops the product next to the bench.
 * The auto-crafter in M6 uses the same recipes without a survivor.
 */
import { lightWorkFactor } from "./light.ts";
import type { RecipeDef } from "@wc/data";
import { atGoal, findItem, goTo, reserve } from "./ai.ts";
import { registerCleanup, registerJob, registerWorkGiver } from "./jobs.ts";
import type { Game } from "./game.ts";
import { countItems, dropItems } from "./items.ts";
import type { Thing } from "./map.ts";
import { benchFeedsOut } from "./logistics.ts";
import { fluidNetOf, netAdd, netAmount, netDraw, totalFluid } from "./fluids.ts";
import { makeRobot, robotCount } from "./robots.ts";
import { pickUp } from "./hauling.ts";
import { addStat, learn, workSpeed, skillLevel, type Job, type Pawn } from "./pawn.ts";
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

// ---------------------------------------------------------------- make queue

/** How many orders a bench's make queue holds. */
export const QUEUE_MAX = 5;

/** Add a make order (or more of the last order when it is the same recipe). False when the queue is full. */
export function queueAdd(game: Game, bench: Thing, recipeId: string, n = 1): boolean {
  if (!recipesFor(game, game.reg.things.list[bench.def].id).some((r) => r.id === recipeId)) return false;
  const q = (bench.queue ??= []);
  const last = q[q.length - 1];
  if (last?.recipe === recipeId) {
    last.left = Math.min(99, last.left + n);
    return true;
  }
  if (q.length >= QUEUE_MAX) return false;
  q.push({ recipe: recipeId, left: Math.max(1, Math.min(99, n)) });
  return true;
}

/** Change an order's count; 0 removes it. */
export function queueSet(bench: Thing, index: number, left: number): void {
  const q = bench.queue;
  if (!q?.[index]) return;
  if (left <= 0) q.splice(index, 1);
  else q[index].left = Math.min(99, left);
}

/** Move an order one place up (earlier). */
export function queueUp(bench: Thing, index: number): void {
  const q = bench.queue;
  if (!q || index <= 0 || index >= q.length) return;
  [q[index - 1], q[index]] = [q[index], q[index - 1]];
}

export function recipesFor(game: Game, benchDefId: string): RecipeDef[] {
  return game.reg.content.recipes.filter((r) => r.benches.includes(benchDefId) && (!r.research || game.research.done.has(r.research)));
}

/** Units in stock of the recipe's first output (on the ground anywhere, not carried). */
export function stockOf(game: Game, r: RecipeDef): number {
  if (r.spawn) return robotCount(game, r.spawn);
  if (r.fluidOut) return totalFluid(game, r.fluidOut.kind);
  const [item] = Object.keys(r.output);
  return countItems(game, item);
}

export function matchesInput(game: Game, input: RecipeDef["inputs"][number], defIdx: number): boolean {
  const d = game.reg.items.list[defIdx];
  if (input.item) return d.id === input.item;
  if (input.tag === "raw_food") return d.raw;
  return false;
}

function benchWorkSpeed(game: Game, p: Pawn, r: RecipeDef, bench: Thing): number {
  const base = r.skill ? workSpeed(game, p) * (0.4 + 0.06 * skillLevel(game, p, r.skill)) : workSpeed(game, p);
  return base * game.reg.things.list[bench.def].benchSpeed * lightWorkFactor(game, p);
}

/** Benches that need power only work while powered. */
function benchReady(game: Game, bench: Thing): boolean {
  const d = game.reg.things.list[bench.def];
  if (d.burns && !(bench.fuel ?? 0)) return false;
  return !d.power?.use || !!bench.powered;
}

/**
 * Give a bill job of this work type, if any bench needs one done. `urgentOnly`: only make orders, and
 * bills whose stock is below half the target (water at the well while the colony runs dry).
 */
function billJob(game: Game, p: Pawn, workType: WorkType, urgentOnly = false): Job | null {
  const benches = [...game.things.values()]
    .filter((t) => game.reg.things.list[t.def].bench && benchReady(game, t))
    .sort((a, b) => (a.x - p.x) ** 2 + (a.y - p.y) ** 2 - ((b.x - p.x) ** 2 + (b.y - p.y) ** 2));
  for (const bench of benches) {
    const def = game.reg.things.list[bench.def];
    const all = recipesFor(game, def.id);
    // Make orders first, in queue order; then the "keep in stock" bills.
    const queued = (bench.queue ?? []).map((o) => all.find((r) => r.id === o.recipe)).filter((r): r is RecipeDef => !!r);
    const cands: [RecipeDef, boolean][] = [...queued.map((r) => [r, true] as [RecipeDef, boolean]), ...all.map((r) => [r, false] as [RecipeDef, boolean])];
    for (const [r, isOrder] of cands) {
      if (recipeWorkType(r) !== workType) continue;
      if (!isOrder && stockOf(game, r) >= billTarget(game, bench, r)) continue;
      if (urgentOnly && !isOrder && stockOf(game, r) >= billTarget(game, bench, r) / 2) continue;
      if (!game.path.canReachAdjacent(p, bench)) continue;
      // All inputs must exist somewhere before starting.
      const enough = r.inputs.every((inp) => {
        let n = 0;
        for (const s of game.items.values()) if (s.layer >= 0 && !s.contaminated && !s.forbidden && matchesInput(game, inp, s.def)) n += s.count;
        for (const [k, v] of Object.entries(bench.buffer ?? {})) if (matchesInput(game, inp, Number(k))) n += v;
        return n >= inp.count;
      });
      if (!enough) continue;
      // Fluid inputs come from the bench's own pipes.
      if (r.fluidIn) {
        const net = fluidNetOf(game, bench);
        if (!net || netAmount(game, net, r.fluidIn.kind) < r.fluidIn.liters) continue;
      }
      if (!reserve(game, `thing:${bench.id}`, p)) continue;
      return { kind: "bill", stage: 0, targetId: bench.id, data: { recipe: r.id, input: 0, have: 0, work: r.work, ...(isOrder ? { order: true } : {}) } };
    }
  }
  return null;
}

// Haul-type bills (water from the well) come before plain hauling, or a big salvage pile keeps
// everyone carrying junk while the colony goes thirsty.
for (const wt of ["cook", "craft", "haul"] as WorkType[]) registerWorkGiver({ workType: wt, give: (game, p) => billJob(game, p, wt) }, wt === "haul");

/**
 * Urgent haul-type bills (user report: "the well is not producing water"). Hauling comes last in the
 * work order, so a busy colony (sowing, mining, salvage) never filled the well's jugs. Make orders
 * there, and water below half its target, come before all other work for anyone who hauls.
 */
export function urgentBillJob(game: Game, p: Pawn): Job | null {
  return billJob(game, p, "haul", true);
}

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
      useBuffer(game, bench, r, job);
      // Skip filled slots; when all are filled, start working.
      while ((job.data!.input as number) < r.inputs.length && missingNow(r, job) <= 0) {
        job.data!.input = (job.data!.input as number) + 1;
        job.data!.have = 0;
        useBuffer(game, bench, r, job);
      }
      if ((job.data!.input as number) >= r.inputs.length) {
        if (!goTo(game, p, bench, true)) return "fail";
        // Take the fluid now; the cleanup gives it back if the job stops early.
        if (r.fluidIn && !job.data!.fluid) {
          const net = fluidNetOf(game, bench);
          const got = net ? netDraw(game, net, r.fluidIn.kind, r.fluidIn.liters) : 0;
          if (got < r.fluidIn.liters) {
            if (net && got > 0) netAdd(game, net, r.fluidIn.kind, got);
            return "fail";
          }
          job.data!.fluid = got;
        }
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
  if (!benchReady(game, bench)) return "fail";
  job.data!.work = (job.data!.work as number) - benchWorkSpeed(game, p, r, bench);
  // A stove burns its fuel only while someone cooks on it.
  const burns = game.reg.things.list[bench.def].burns;
  if (burns?.whileWorking) bench.fuel = Math.max(0, (bench.fuel ?? 0) - burns.perHour / game.ticksPerHour);
  if (r.skill) learn(game, p, r.skill, 0.4);
  if ((job.data!.work as number) > 0) return "run";
  // A make order: one fewer to go; the order leaves the queue when it is done.
  if (job.data!.order) {
    const i = (bench.queue ?? []).findIndex((o) => o.recipe === r.id);
    if (i >= 0) queueSet(bench, i, bench.queue![i].left - 1);
  }
  // Water from a contaminated well is contaminated too.
  const cont = isContaminatedThing(game, bench);
  // A robot rolls out of the bay.
  if (r.spawn) {
    const bot = makeRobot(game, r.spawn, bench.layer, bench.x, bench.y);
    game.pawns.set(bot.id, bot);
    game.message("msg.robot_built", { kind: r.spawn, name: bot.nick }, "info", bot);
  }
  // Fluids go into the bench's own pipe network (what does not fit is lost).
  if (r.fluidOut) {
    const net = fluidNetOf(game, bench);
    if (net) netAdd(game, net, r.fluidOut.kind, r.fluidOut.liters);
  }
  // A belt, chest or arm on the output side takes the products; else they go next to the worker.
  const out = !cont && benchFeedsOut(game, bench);
  for (const [item, n] of Object.entries(r.output)) {
    if (!out) dropItems(game, item, n, p.layer, p.x, p.y, cont, bench.contamUntil);
    else {
      const def = game.reg.items.idx(item);
      bench.out = { ...(bench.out ?? {}), [def]: (bench.out?.[def] ?? 0) + n };
    }
  }
  job.data!.done = true;
  addStat(p, "crafted");
  return "done";
});

/** If a bill job ends early, put the used inputs back: carried ones on the ground, buffered ones in the bench. */
registerCleanup("bill", (game, p, job) => {
  if (job.data?.done) return;
  const bench = game.things.get(job.targetId!);
  const r = game.reg.content.recipes.find((x) => x.id === job.data?.recipe);
  if (bench && r?.fluidIn && typeof job.data?.fluid === "number") {
    const net = fluidNetOf(game, bench);
    if (net) netAdd(game, net, r.fluidIn.kind, job.data.fluid);
  }
  for (const [k, v] of Object.entries(job.data ?? {})) {
    if (typeof v !== "number" || v <= 0 || k === "fluid") continue;
    if (k.startsWith("u")) dropItems(game, Number(k.slice(1)), v, p.layer, p.x, p.y);
    else if (k.startsWith("b") && bench) {
      const def = Number(k.slice(1));
      bench.buffer = { ...(bench.buffer ?? {}), [def]: (bench.buffer?.[def] ?? 0) + v };
    }
  }
});

/** Fill the job's current input slot from the bench's input buffer (what belts and arms brought). */
function useBuffer(game: Game, bench: Thing, r: RecipeDef, job: Job): void {
  const idx = job.data!.input as number;
  if (!bench.buffer || idx >= r.inputs.length) return;
  const inp = r.inputs[idx];
  for (const [k, v] of Object.entries(bench.buffer)) {
    const missing = inp.count - (job.data!.have as number);
    if (missing <= 0 || v <= 0 || !matchesInput(game, inp, Number(k))) continue;
    const n = Math.min(v, missing);
    bench.buffer[Number(k)] -= n;
    job.data!.have = (job.data!.have as number) + n;
    job.data![`b${k}`] = ((job.data![`b${k}`] as number) ?? 0) + n;
  }
}
