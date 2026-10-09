/**
 * Research (spec 05 "Research"). Survivors with the research work type study at a desk.
 * Some projects need a salvaged blueprint item in stock before they can start.
 */
import type { ResearchDef } from "@wc/data";
import { atGoal, goTo, isReserved, reserve } from "./ai.ts";
import type { Game } from "./game.ts";
import { countItems } from "./items.ts";
import { registerJob, registerWorkGiver } from "./jobs.ts";
import { learn } from "./pawn.ts";
import { workRate } from "./work.ts";

export function researchDef(game: Game, id: string): ResearchDef {
  return game.reg.content.research.find((r) => r.id === id)!;
}

export type ResearchState = "done" | "available" | "locked" | "needs_blueprint";

export function researchState(game: Game, id: string): ResearchState {
  const r = researchDef(game, id);
  if (game.research.done.has(id)) return "done";
  if (!r.prereqs.every((p) => game.research.done.has(p))) return "locked";
  if (r.blueprint && countItems(game, r.blueprint) < 1) return "needs_blueprint";
  return "available";
}

export function setResearch(game: Game, id: string | null): boolean {
  if (id !== null && researchState(game, id) !== "available") return false;
  game.research.current = id;
  return true;
}

export function finishResearch(game: Game, id: string): void {
  game.research.done.add(id);
  game.research.progress.delete(id);
  if (game.research.current === id) game.research.current = null;
  game.message("msg.research_done", { project: id }, "info");
}

registerWorkGiver({
  workType: "research",
  give(game, p) {
    const cur = game.research.current;
    if (!cur || researchState(game, cur) !== "available") return null;
    for (const t of game.things.values()) {
      if (!game.reg.things.list[t.def].research || isReserved(game, `thing:${t.id}`, p)) continue;
      if (!game.path.canReachAdjacent(p, t) || !reserve(game, `thing:${t.id}`, p)) continue;
      return { kind: "research", stage: 0, targetId: t.id };
    }
    return null;
  },
});

registerJob("research", (game, p, job) => {
  const desk = game.things.get(job.targetId!);
  const cur = game.research.current;
  if (!desk || !cur || researchState(game, cur) !== "available") return "fail";
  if (job.stage === 0) {
    if (!goTo(game, p, desk, true)) return "fail";
    job.stage = 1;
  }
  if (!atGoal(p)) return "run";
  const r = researchDef(game, cur);
  const got = (game.research.progress.get(cur) ?? 0) + workRate(game, p, "technology") * (game.reg.things.list[desk.def].research ?? 1);
  learn(game, p, "technology", 0.4);
  if (got >= r.cost) {
    finishResearch(game, cur);
    return "done";
  }
  game.research.progress.set(cur, got);
  // Take a break now and then, so needs get a turn.
  return (game.tick + p.id) % Math.round(game.ticksPerHour * 2) === 0 ? "done" : "run";
});
