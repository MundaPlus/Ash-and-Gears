/**
 * Traps (user request): spike traps and blast traps from research. A hostile who steps on an armed trap
 * sets it off. Survivors, prisoners and guests know the traps and never set them off. A spike trap is
 * then sprung until a builder re-arms it; a blast trap burns every hostile close by and is used up.
 * A trap that is used up or destroyed leaves a plan to build it again: traps come back until the player
 * deconstructs them.
 */
import { dist } from "./combat.ts";
import type { Game } from "./game.ts";
import { damage } from "./health.ts";
import { registerWorkGiver } from "./jobs.ts";
import { NO_THING, type Thing } from "./map.ts";
import type { Pawn } from "./pawn.ts";
import { registerTask, workJob } from "./work.ts";
import { placeBlueprint } from "./construction.ts";

/** Look for pawns on traps this often (ticks); a walker stays several ticks on each tile. */
const TRAP_EVERY = 3;
/** Work ticks to re-arm a spike trap. */
const REARM_WORK = 60;

const FRIENDLY = new Set(["colony", "prisoner", "visitor", "trader"]);

/** Who sets off traps: anyone not friendly to the colony, still on their feet. */
function setsOff(p: Pawn): boolean {
  return !FRIENDLY.has(p.faction) && !p.health.downed;
}

export function tickTraps(game: Game): void {
  if (game.tick % TRAP_EVERY !== 0) return;
  for (const p of [...game.pawns.values()]) {
    if (!setsOff(p) || !game.pawns.has(p.id)) continue;
    const L = game.map.layers[p.layer];
    const th = L.thing[L.i(p.x, p.y)];
    if (th === NO_THING) continue;
    const t = game.things.get(th)!;
    if (game.reg.things.list[t.def].trap && !t.sprung) springTrap(game, t, p);
  }
}

/** The trap goes off under `victim`. */
export function springTrap(game: Game, t: Thing, victim: Pawn): void {
  const d = game.reg.things.list[t.def];
  const trap = d.trap!;
  const hit = trap.radius > 0 ? [...game.pawns.values()].filter((o) => o.layer === t.layer && setsOff(o) && dist(o, t) <= trap.radius) : [victim];
  const human = game.reg.content.creatures[victim.creature].behavior === "human";
  const who: Record<string, string> = human ? { name: victim.nick } : { creature: game.reg.content.creatures[victim.creature].id };
  game.message(human ? "msg.trap_sprung" : "msg.trap_sprung_beast", { thing: d.id, ...who }, "info", { layer: t.layer, x: t.x, y: t.y });
  for (const o of hit) if (game.pawns.has(o.id)) damage(game, o, trap.dmg, trap.kind);
  if (trap.once) {
    game.removeThing(t.id);
    rebuildTrap(game, d.id, t.layer, t.x, t.y, t.rot);
  } else {
    t.sprung = true;
    game.map.layers[t.layer].touch(t.x, t.y);
  }
}

/** A trap was used up or destroyed (not deconstructed): plan it again on the same tile. */
export function rebuildTrap(game: Game, defId: string, layer: number, x: number, y: number, rot?: number): void {
  if (!game.reg.things.get(defId).trap) return;
  placeBlueprint(game, "thing", defId, layer, x, y, rot);
}

registerTask("rearm", {
  skill: "construction",
  xp: 0.3,
  total: () => REARM_WORK,
  valid: (game, job) => {
    const t = job.targetId !== undefined ? game.things.get(job.targetId) : undefined;
    return !!t?.sprung;
  },
  complete: (game, _p, job) => {
    const t = game.things.get(job.targetId!);
    if (!t) return;
    delete t.sprung;
    game.map.layers[t.layer].touch(t.x, t.y);
  },
});

/**
 * Builders re-arm the nearest sprung trap they can reach. The AI asks this right after food and water,
 * before all other work (user request: a sprung trap is a hole in the defense).
 */
export function rearmJob(game: Game, p: Pawn) {
  const sprung = [...game.things.values()].filter((t) => t.sprung).sort((a, b) => dist(a, p) - dist(b, p));
  for (const t of sprung) {
    if (!game.path.canReachAdjacent(p, t)) continue;
    const job = workJob(game, p, "rearm", { layer: t.layer, x: t.x, y: t.y }, t.id);
    if (job) return job;
  }
  return null;
}

registerWorkGiver({ workType: "construct", give: rearmJob });
