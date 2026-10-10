/** Work types and priorities. No imports, so both the AI and the work system can use it. */
import type { Pawn } from "./pawn.ts";

/** Work types in default order (spec 01, "Work"). Givers exist for some; the rest arrive in later milestones. */
export const WORK_TYPES = ["firefight", "doctor", "warden", "cook", "construct", "grow", "mine", "salvage", "craft", "research", "haul"] as const;
export type WorkType = (typeof WORK_TYPES)[number];
export const DEFAULT_PRIORITY = 3;

export function workPriority(p: Pawn, w: WorkType): number {
  // Work the backstory rules out never happens.
  if (p.noWork?.includes(w)) return 0;
  return p.work[w] ?? DEFAULT_PRIORITY;
}

/** Work types the pawn does, best priority first, then default order. */
export function workOrder(p: Pawn): WorkType[] {
  return WORK_TYPES.filter((w) => workPriority(p, w) > 0).sort(
    (a, b) => workPriority(p, a) - workPriority(p, b) || WORK_TYPES.indexOf(a) - WORK_TYPES.indexOf(b),
  );
}

