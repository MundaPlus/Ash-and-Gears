/**
 * Demo goal chain (spec 07, "Demo subset"): build shelter, find clean water,
 * survive the first raid, turn the lights on. Checked once per in-game hour.
 */
import type { Game } from "./game.ts";
import { isPowered } from "./power.ts";
import { roomAt } from "./rooms.ts";

export const GOALS = ["shelter", "water", "raid", "lights"] as const;
export type GoalId = (typeof GOALS)[number];

function check(game: Game, id: GoalId): boolean {
  switch (id) {
    case "shelter":
      // A bed in an enclosed, roofed room.
      for (const t of game.things.values()) {
        if (!game.reg.things.list[t.def].bed) continue;
        const r = roomAt(game, t.layer, t.x, t.y);
        if (r && !r.outdoor) return true;
      }
      return false;
    case "water":
      for (const t of game.things.values()) {
        const d = game.reg.things.list[t.def];
        if (d.water === "clean" || d.rainCollect) return true;
      }
      return false;
    case "raid":
      return game.story.raidsSurvived > 0;
    case "lights":
      for (const t of game.things.values()) if (game.reg.things.list[t.def].light && game.reg.things.list[t.def].power && isPowered(game, t)) return true;
      return false;
  }
}

export function tickGoals(game: Game): void {
  if (game.tick % Math.round(game.ticksPerHour) !== 0) return;
  for (const id of GOALS) {
    if (game.goals[id]) continue;
    if (check(game, id)) {
      game.goals[id] = true;
      game.message(`goal.${id}.done`, {}, "info");
      if (GOALS.every((g) => game.goals[g])) game.message("goal.all_done", {}, "info");
    }
  }
}
