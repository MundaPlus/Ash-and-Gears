/**
 * Player orders on tiles (spec 03, "Orders"): salvage / deconstruct, mine, clear rubble, cut plants.
 * The player marks tiles. Work givers find the nearest marked tile and make a work job.
 */
import { isReserved } from "./ai.ts";
import { registerWorkGiver } from "./jobs.ts";
import type { Game } from "./game.ts";
import { countItems, dropItems } from "./items.ts";
import { spillContents } from "./logistics.ts";
import { Desig, NO_THING, type DesigKind } from "./map.ts";
import { skillLevel, type Job, type Pawn } from "./pawn.ts";
import { registerTask, workJob, type WorkType } from "./work.ts";
import { workPriority } from "./worktypes.ts";

/** Can this order go on this tile? */
export function canDesignate(game: Game, kind: DesigKind, layer: number, x: number, y: number): boolean {
  const L = game.map.layers[layer];
  if (!L.inBounds(x, y)) return false;
  const td = game.reg.terrain.list[L.terrain[L.i(x, y)]];
  const thing = game.thingDefAt(layer, x, y);
  switch (kind) {
    case "mine":
      return td.solid && !!td.minedTo;
    case "clear":
      return !!td.clearTo && !thing;
    case "cut":
      return thing?.kind === "plant";
    case "salvage":
      // Only ruins, wrecks and junk. A drag over the base never takes it apart. Stairs stay.
      return !!thing && thing.kind !== "plant" && thing.kind !== "stairs" && !thing.build && !!thing.yield;
    case "deconstruct":
      // Player-built things, with a separate order.
      return !!thing && thing.kind !== "stairs" && !!thing.build;
  }
}

export function designate(game: Game, kind: DesigKind, layer: number, x: number, y: number): boolean {
  if (!canDesignate(game, kind, layer, x, y)) return false;
  const L = game.map.layers[layer];
  const i = L.i(x, y);
  L.desig[i] = Desig[kind];
  game.desigTiles.add(layer * L.w * L.h + i);
  L.touch(x, y);
  game.mapVersion++;
  return true;
}

export function undesignate(game: Game, layer: number, x: number, y: number): void {
  const L = game.map.layers[layer];
  if (!L.inBounds(x, y)) return;
  const i = L.i(x, y);
  if (!L.desig[i]) return;
  L.desig[i] = 0;
  game.desigTiles.delete(layer * L.w * L.h + i);
  game.autoDesig.delete(layer * L.w * L.h + i);
  L.touch(x, y);
  game.mapVersion++;
}

function desigAt(game: Game, job: Job): number {
  const t = job.target!;
  const L = game.map.layers[t.layer];
  return L.desig[L.i(t.x, t.y)];
}

// ---------------------------------------------------------------- tasks

/** Yield multiplier from skill: 0.7 at skill 0, 1.0 at 10, 1.3 at 20. */
const yieldMult = (lvl: number) => 0.7 + lvl * 0.03;

function dropYield(game: Game, yields: Record<string, number> | undefined, mult: number, layer: number, x: number, y: number) {
  for (const [item, n] of Object.entries(yields ?? {})) {
    const count = Math.max(1, Math.round(n * mult));
    dropItems(game, item, count, layer, x, y);
  }
}

registerTask("mine", {
  skill: "mining",
  xp: 0.5,
  total: (game, job) => {
    const t = job.target!;
    const L = game.map.layers[t.layer];
    return game.reg.terrain.list[L.terrain[L.i(t.x, t.y)]].work;
  },
  valid: (game, job) => desigAt(game, job) === Desig.mine,
  complete: (game, p, job) => {
    const t = job.target!;
    const L = game.map.layers[t.layer];
    const td = game.reg.terrain.list[L.terrain[L.i(t.x, t.y)]];
    undesignate(game, t.layer, t.x, t.y);
    game.setTerrain(t.layer, t.x, t.y, td.minedTo!);
    dropYield(game, td.mineYield, yieldMult(skillLevel(game, p, "mining")), t.layer, t.x, t.y);
  },
});

registerTask("clear", {
  skill: "construction",
  xp: 0.3,
  total: (game, job) => {
    const t = job.target!;
    const L = game.map.layers[t.layer];
    return game.reg.terrain.list[L.terrain[L.i(t.x, t.y)]].work;
  },
  valid: (game, job) => desigAt(game, job) === Desig.clear,
  complete: (game, _p, job) => {
    const t = job.target!;
    const L = game.map.layers[t.layer];
    const td = game.reg.terrain.list[L.terrain[L.i(t.x, t.y)]];
    undesignate(game, t.layer, t.x, t.y);
    game.setTerrain(t.layer, t.x, t.y, td.clearTo!);
    dropYield(game, td.clearYield, 1, t.layer, t.x, t.y);
  },
});

registerTask("cut", {
  skill: "farming",
  xp: 0.3,
  total: (game, job) => game.thingDefAt(job.target!.layer, job.target!.x, job.target!.y)?.work ?? 1,
  valid: (game, job) => desigAt(game, job) === Desig.cut && game.thingDefAt(job.target!.layer, job.target!.x, job.target!.y)?.kind === "plant",
  complete: (game, p, job) => {
    const t = job.target!;
    const L = game.map.layers[t.layer];
    const def = game.thingDefAt(t.layer, t.x, t.y)!;
    undesignate(game, t.layer, t.x, t.y);
    game.removeThing(L.thing[L.i(t.x, t.y)]);
    dropYield(game, def.yield, yieldMult(skillLevel(game, p, "farming")), t.layer, t.x, t.y);
  },
});

registerTask("salvage", {
  skill: "scavenging",
  xp: 0.5,
  total: (game, job) => {
    const def = game.thingDefAt(job.target!.layer, job.target!.x, job.target!.y);
    if (!def) return 1;
    // Deconstructing your own building takes half its build work.
    return def.build ? Math.ceil(def.build.work / 2) : def.work;
  },
  valid: (game, job) => desigAt(game, job) === Desig.salvage && !!game.thingDefAt(job.target!.layer, job.target!.x, job.target!.y),
  complete: (game, p, job) => {
    const t = job.target!;
    const L = game.map.layers[t.layer];
    const def = game.thingDefAt(t.layer, t.x, t.y)!;
    undesignate(game, t.layer, t.x, t.y);
    spillContents(game, game.things.get(L.thing[L.i(t.x, t.y)])!);
    game.removeThing(L.thing[L.i(t.x, t.y)]);
    const lvl = skillLevel(game, p, "scavenging");
    if (def.build) {
      // Deconstruct: get 75% of the materials back.
      for (const [item, n] of Object.entries(def.build.cost)) {
        const back = Math.floor(n * 0.75);
        if (back > 0) dropItems(game, item, back, t.layer, t.x, t.y);
      }
      return;
    }
    dropYield(game, def.yield, yieldMult(lvl), t.layer, t.x, t.y);
    for (const [item, [lo, hi]] of Object.entries(def.drops ?? {})) {
      const n = game.aiRng.int(lo, hi);
      if (n > 0) dropItems(game, item, n, t.layer, t.x, t.y);
    }
    // A blueprint the colony still needs: not researched yet and not in stock.
    if (def.blueprintChance > 0 && game.aiRng.chance(def.blueprintChance)) {
      const wanted = game.reg.content.research
        .filter((r) => r.blueprint && !storyItems(game).has(r.blueprint) && !game.research.done.has(r.id) && countItems(game, r.blueprint) < 1)
        .map((r) => r.blueprint!);
      if (wanted.length) {
        const item = game.aiRng.pick(wanted);
        dropItems(game, item, 1, t.layer, t.x, t.y);
        game.message("msg.blueprint_found", { name: p.nick, item }, "info", { layer: t.layer, x: t.x, y: t.y });
      }
    }
    if (game.aiRng.chance(def.lootChance * (1 + lvl / 20))) {
      const loot = Object.entries(game.reg.content.loot);
      const [item, [lo, hi]] = game.aiRng.pick(loot);
      const n = game.aiRng.int(lo, hi);
      dropItems(game, item, n, t.layer, t.x, t.y);
      game.message("msg.loot_found", { name: p.nick, count: n, item }, "info", { layer: t.layer, x: t.x, y: t.y });
    }
  },
});

registerTask("deconstruct", {
  skill: "construction",
  xp: 0.3,
  total: (game, job) => Math.ceil((game.thingDefAt(job.target!.layer, job.target!.x, job.target!.y)?.build?.work ?? 2) / 2),
  valid: (game, job) => desigAt(game, job) === Desig.deconstruct && !!game.thingDefAt(job.target!.layer, job.target!.x, job.target!.y)?.build,
  complete: (game, _p, job) => {
    const t = job.target!;
    const L = game.map.layers[t.layer];
    const def = game.thingDefAt(t.layer, t.x, t.y)!;
    undesignate(game, t.layer, t.x, t.y);
    spillContents(game, game.things.get(L.thing[L.i(t.x, t.y)])!);
    game.removeThing(L.thing[L.i(t.x, t.y)]);
    // Get 75% of the materials back.
    for (const [item, n] of Object.entries(def.build!.cost)) {
      const back = Math.floor(n * 0.75);
      if (back > 0) dropItems(game, item, back, t.layer, t.x, t.y);
    }
  },
});

// ---------------------------------------------------------------- work givers

const GIVERS: [WorkType, DesigKind][] = [
  ["mine", "mine"],
  ["salvage", "salvage"],
  ["construct", "clear"],
  ["grow", "cut"],
  ["construct", "deconstruct"],
];

function nearestDesignated(game: Game, p: Pawn, kind: DesigKind): Job | null {
  const code = Desig[kind];
  const { w, h } = game.map;
  const cands: { layer: number; x: number; y: number; d: number }[] = [];
  for (const n of game.desigTiles) {
    const layer = Math.floor(n / (w * h));
    const i = n - layer * w * h;
    if (game.map.layers[layer].desig[i] !== code) continue;
    const x = i % w, y = Math.floor(i / w);
    if (isReserved(game, `tile:${layer},${x},${y}`, p)) continue;
    // The player's own orders first; orders a survivor gave itself when idle come after them.
    const own = game.autoDesig.has(n) ? 1e7 : 0;
    cands.push({ layer, x, y, d: own + (x - p.x) ** 2 + (y - p.y) ** 2 + (layer !== p.layer ? 900 : 0) });
  }
  cands.sort((a, b) => a.d - b.d);
  for (const c of cands.slice(0, 20)) {
    const pos = { layer: c.layer, x: c.x, y: c.y };
    if (!game.path.canReachAdjacent(p, pos)) continue;
    const L = game.map.layers[c.layer];
    const job = workJob(game, p, kind, pos, L.thing[L.i(c.x, c.y)] === NO_THING ? undefined : L.thing[L.i(c.x, c.y)]);
    if (job) return job;
  }
  return null;
}

for (const [workType, kind] of GIVERS) {
  registerWorkGiver({ workType, give: (game, p) => (game.desigTiles.size ? nearestDesignated(game, p, kind) : null) });
}

// ---------------------------------------------------------------- idle survivors find their own work

/** How far from home idle survivors look for work (tiles). */
const OWN_WORK_RANGE = 30;
/** Self-chosen orders per survivor at most. */
const OWN_ORDERS_PER_PAWN = 2;
/** Ticks between two searches by the same survivor. */
const OWN_WORK_EVERY = 120;
const ownWorkTried = new WeakMap<Game, Map<number, number>>();

/**
 * An idle survivor (nothing the work givers offer) gives itself an order: salvage ruins and junk near
 * home, or cut dead trees and shrubs (first when wood runs low). Only work types the survivor does.
 * Returns true when it placed an order (the next think picks it up).
 */
export function findOwnWork(game: Game, p: Pawn): boolean {
  if (p.layer !== 0 || p.robot || game.opts.idleWork === false) return false;
  // Look at most every few seconds per survivor (the search walks every thing on the map).
  const tried = ownWorkTried.get(game) ?? new Map<number, number>();
  ownWorkTried.set(game, tried);
  if (game.tick - (tried.get(p.id) ?? -1e9) < OWN_WORK_EVERY) return false;
  tried.set(p.id, game.tick);
  const colonists = [...game.pawns.values()].filter((o) => o.faction === "colony" && !o.robot).length;
  if (game.autoDesig.size >= OWN_ORDERS_PER_PAWN * Math.max(1, colonists)) return false;
  const woodLow = countItems(game, "wood") < 50;
  const kinds: [DesigKind, WorkType][] = woodLow ? [["cut", "grow"], ["salvage", "salvage"]] : [["salvage", "salvage"], ["cut", "grow"]];
  const L = game.map.layers[0];
  const h = game.home;
  for (const [kind, wt] of kinds) {
    if (workPriority(p, wt) <= 0) continue;
    let best: { x: number; y: number; d: number } | null = null;
    for (const t of game.things.values()) {
      if (t.layer !== 0 || Math.abs(t.x - h.x) > OWN_WORK_RANGE || Math.abs(t.y - h.y) > OWN_WORK_RANGE) continue;
      const def = game.reg.things.list[t.def];
      // Cut only wild plants, never crops in a grow zone.
      if (kind === "cut" && (def.kind !== "plant" || def.crop)) continue;
      if (kind === "salvage" && def.kind === "plant") continue;
      if (L.desig[L.i(t.x, t.y)] || !canDesignate(game, kind, 0, t.x, t.y)) continue;
      const d = (t.x - p.x) ** 2 + (t.y - p.y) ** 2;
      if (!best || d < best.d) best = { x: t.x, y: t.y, d };
    }
    if (best && game.path.canReachAdjacent(p, { layer: 0, x: best.x, y: best.y }) && designate(game, kind, 0, best.x, best.y)) {
      game.autoDesig.add(L.i(best.x, best.y));
      return true;
    }
  }
  return false;
}

/** Items that only story sites give (never found by random salvage). */
function storyItems(game: Game): Set<string> {
  const out = new Set<string>();
  for (const s of game.reg.content.story) for (const b of s.beats) for (const e of [...b.start, ...b.done]) for (const k of Object.keys(e.items ?? {})) out.add(k);
  return out;
}
