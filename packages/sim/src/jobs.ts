/**
 * Job and work-giver registries. No imports at runtime, so any module can register
 * at load time without import-order problems.
 */
import type { Game } from "./game.ts";
import type { Job, Pawn } from "./pawn.ts";

export type JobResult = "run" | "done" | "fail";
export type JobDriver = (game: Game, p: Pawn, job: Job) => JobResult;

export const drivers = new Map<string, JobDriver>();
export function registerJob(kind: string, driver: JobDriver): void {
  drivers.set(kind, driver);
}

/** Called when a job of this kind ends for any reason (done, failed or interrupted). */
export const cleanups = new Map<string, (game: Game, p: Pawn, job: Job) => void>();
export function registerCleanup(kind: string, fn: (game: Game, p: Pawn, job: Job) => void): void {
  cleanups.set(kind, fn);
}

/** A work giver looks for work of one type and gives the pawn a job, or returns null. */
export interface WorkGiver {
  workType: string;
  give(game: Game, p: Pawn): Job | null;
}
export const workGivers: WorkGiver[] = [];
export function registerWorkGiver(g: WorkGiver): void {
  workGivers.push(g);
}

/** Work types that have at least one giver (the ones that matter right now). */
export function activeWorkTypes(): string[] {
  return [...new Set(workGivers.map((g) => g.workType))];
}

