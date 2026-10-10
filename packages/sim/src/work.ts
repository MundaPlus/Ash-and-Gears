/**
 * Work: work types, priorities, and the generic "work" job that walks to a target and
 * spends work ticks on it. Tasks (mine, salvage, build...) plug in through registerTask.
 * Progress is kept on the game per target, so an interrupted task resumes where it stopped.
 */
import { atGoal, goTo, reserve } from "./ai.ts";
import { registerJob } from "./jobs.ts";
import type { Game } from "./game.ts";
import type { Pos } from "./path.ts";
import { learn, skillLevel, workSpeed, type Job, type Pawn } from "./pawn.ts";

export * from "./worktypes.ts";

/** Work ticks done per sim tick: 0.4 at skill 0, 1.0 at skill 10, 1.6 at skill 20. */
export function workRate(game: Game, p: Pawn, skill: string): number {
  return workSpeed(game, p) * (0.4 + 0.06 * skillLevel(game, p, skill));
}

export interface Task {
  skill: string;
  /** XP per work tick. */
  xp: number;
  /** Total work ticks for this target. */
  total(game: Game, job: Job): number;
  /** False if the target is gone or no longer valid. */
  valid(game: Game, job: Job): boolean;
  complete(game: Game, p: Pawn, job: Job): void;
}

const tasks = new Map<string, Task>();
export function registerTask(name: string, t: Task): void {
  tasks.set(name, t);
}

const key = (task: string, pos: Pos) => `${task}:${pos.layer},${pos.x},${pos.y}`;

/** Make a work job, or null if the target is reserved by someone else. */
export function workJob(game: Game, p: Pawn, task: string, target: Pos, id?: number): Job | null {
  if (!reserve(game, `tile:${target.layer},${target.x},${target.y}`, p)) return null;
  return { kind: "work", stage: 0, target, targetId: id, data: { task } };
}

/** How far a pawn's work at a place is (0..1), and where, for progress bars. Null when it is not working yet. */
export function jobProgress(game: Game, p: Pawn): { at: Pos; k: number } | null {
  const j = p.job;
  if (!j || j.stage < 2) return null;
  if (j.kind === "work" && j.target) {
    const task = tasks.get(j.data!.task as string);
    if (!task) return null;
    const total = task.total(game, j);
    const left = game.progress.get(key(j.data!.task as string, j.target)) ?? total;
    return { at: j.target, k: total > 0 ? 1 - left / total : 0 };
  }
  if (j.kind === "bill") {
    const r = game.reg.content.recipes.find((x) => x.id === j.data!.recipe);
    const bench = game.things.get(j.targetId!);
    if (!r || !bench) return null;
    return { at: { layer: bench.layer, x: bench.x, y: bench.y }, k: 1 - (j.data!.work as number) / r.work };
  }
  return null;
}

registerJob("work", (game, p, job) => {
  const task = tasks.get(job.data!.task as string)!;
  if (!task.valid(game, job)) return "fail";
  if (job.stage === 0) {
    if (!goTo(game, p, job.target!, true)) return "fail";
    job.stage = 1;
  }
  if (job.stage === 1) {
    if (!atGoal(p)) return "run";
    job.stage = 2;
  }
  // Face the target while working.
  if (job.target!.x !== p.x) p.facing = job.target!.x > p.x ? 1 : -1;
  const k = key(job.data!.task as string, job.target!);
  const left = (game.progress.get(k) ?? task.total(game, job)) - workRate(game, p, task.skill);
  learn(game, p, task.skill, task.xp);
  if (left > 0) {
    game.progress.set(k, left);
    return "run";
  }
  game.progress.delete(k);
  task.complete(game, p, job);
  return "done";
});
