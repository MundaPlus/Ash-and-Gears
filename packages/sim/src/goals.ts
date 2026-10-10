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

/** i18n key for the next step toward a goal, from the colony's state (first-hour help). */
export function goalHint(game: Game, id: GoalId): string {
  const has = (test: (d: (typeof game.reg.things.list)[number]) => boolean) =>
    [...game.things.values()].some((t) => t.layer === 0 && test(game.reg.things.list[t.def])) ||
    [...game.blueprints.values()].some((b) => b.kind === "thing" && test(game.reg.things.list[b.def]));
  switch (id) {
    case "shelter": {
      if (!has((d) => d.wall && !d.door && !!d.build)) return "hint.shelter.walls";
      // Tiny gaps between ruin walls do not count as rooms here.
      const rooms = [...game.rooms.values()].filter((r) => r.layer === 0 && !r.outdoor && r.size >= 6);
      if (!rooms.length) return "hint.shelter.close";
      const L = game.map.layers[0];
      if ([...game.roofTodo].some((i) => rooms.some((r) => r.id === L.room[i]))) return "hint.shelter.roof";
      return "hint.shelter.bed";
    }
    case "water":
      return "hint.water";
    case "raid":
      return game.time.day < 10 ? "hint.raid.early" : "hint.raid";
    case "lights":
      if (!game.research.done.has("electric_lights")) return "hint.lights.research";
      if (!has((d) => !!d.power?.produce)) return "hint.lights.generator";
      return "hint.lights.wire";
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
