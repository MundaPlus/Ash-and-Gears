/**
 * Research (spec 05 "Research"). Survivors with the research work type study at a desk.
 * Some projects need a salvaged manual. A researcher carries it to a research desk and studies it once
 * (user's choice); then the project is open for good and the manual goes back to storage.
 */
import type { ResearchDef } from "@wc/data";
import { atGoal, goTo, isReserved, reserve } from "./ai.ts";
import type { Game } from "./game.ts";
import { countItems, dropItems } from "./items.ts";
import { findItem } from "./ai.ts";
import { pickUp } from "./hauling.ts";
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
  if (r.blueprint && !game.research.studied.has(r.blueprint)) return "needs_blueprint";
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

// ---------------------------------------------------------------- studying manuals

/** Work units to study one manual at a desk (a short session). */
const STUDY_WORK = 300;

/** Manuals some unfinished project still needs studied. */
function manualsWanted(game: Game): Set<string> {
  return new Set(
    game.reg.content.research.filter((r) => r.blueprint && !game.research.done.has(r.id) && !game.research.studied.has(r.blueprint)).map((r) => r.blueprint!),
  );
}

/** Is a manual somewhere on the map (so a researcher could study it)? */
export function manualFound(game: Game, item: string): boolean {
  return countItems(game, item) > 0;
}

// Studying a found manual comes before the normal research work.
registerWorkGiver(
  {
    workType: "research",
    give(game, p) {
      const want = manualsWanted(game);
      if (!want.size) return null;
      const src = findItem(game, p, (d) => want.has(game.reg.items.list[d].id));
      if (src === null) return null;
      for (const t of game.things.values()) {
        if (!game.reg.things.list[t.def].research || isReserved(game, `thing:${t.id}`, p)) continue;
        if (!game.path.canReachAdjacent(p, t)) continue;
        if (!reserve(game, `thing:${t.id}`, p)) continue;
        if (!reserve(game, `item:${src}`, p)) {
          game.reservations.delete(`thing:${t.id}`);
          return null;
        }
        return { kind: "study", stage: 0, targetId: t.id, data: { src, work: STUDY_WORK } };
      }
      return null;
    },
  },
  true,
);

registerJob("study", (game, p, job) => {
  const desk = game.things.get(job.targetId!);
  if (!desk) return "fail";
  if (job.stage === 0) {
    const s = game.items.get(job.data!.src as number);
    if (!s || !goTo(game, p, s)) return "fail";
    job.stage = 1;
  }
  if (job.stage === 1) {
    if (!atGoal(p)) return "run";
    if (pickUp(game, p, job.data!.src as number, 1) <= 0) return "fail";
    if (!goTo(game, p, desk, true)) return "fail";
    job.stage = 2;
  }
  if (!atGoal(p) || !p.carrying) return p.carrying ? "run" : "fail";
  job.data!.work = (job.data!.work as number) - workRate(game, p, "technology");
  learn(game, p, "technology", 0.2);
  if ((job.data!.work as number) > 0) return "run";
  // Studied: the projects open for good. The manual goes down by the desk; haulers store it.
  const item = game.reg.items.list[p.carrying.def].id;
  game.research.studied.add(item);
  const opens = game.reg.content.research.filter((r) => r.blueprint === item).map((r) => r.id);
  game.message("msg.manual_studied", { name: p.nick, item, project: opens[0] ?? "" }, "info", p);
  dropItems(game, p.carrying.def, p.carrying.count, p.layer, p.x, p.y);
  p.carrying = null;
  return "done";
});

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
