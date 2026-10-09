/**
 * Storyteller (spec 06 "Storytellers"). The Sheriff: threat points grow with time; an event costs points;
 * after a threat comes a calm spell. Sliders scale raids, mutants and radiation clouds.
 * Grandma Grit waits longer between threats; Doctor Chaos ignores the calm spells.
 */
import type { Game } from "./game.ts";
import { dropItems } from "./items.ts";
import { addMemory, makeHostile, makeSurvivor } from "./pawn.ts";
import { scheduleRadCloud } from "./weather.ts";

export interface StoryState {
  points: number;
  lastThreat: number;
  lastGood: number;
  log: { tick: number; event: string }[];
  raidsSurvived: number;
}

const GRACE_DAYS = 3;
const STYLE = {
  sheriff: { calmDays: 3, pointsPerDay: 1.2, goodChance: 0.18 },
  grandma: { calmDays: 6, pointsPerDay: 0.8, goodChance: 0.25 },
  chaos: { calmDays: 0, pointsPerDay: 1.6, goodChance: 0.15 },
  none: { calmDays: 9999, pointsPerDay: 0, goodChance: 0 },
};

type EventKind = "raid" | "rad_rats" | "glow_hounds" | "rad_cloud";

function cost(game: Game, kind: EventKind): number {
  const colonists = [...game.pawns.values()].filter((p) => p.faction === "colony").length;
  switch (kind) {
    case "rad_rats":
      return 2;
    case "glow_hounds":
      return 4;
    case "rad_cloud":
      return 3;
    case "raid":
      return 4 + colonists;
  }
}

function weight(game: Game, kind: EventKind): number {
  const o = game.opts;
  switch (kind) {
    case "raid":
      return 1.0 * o.raidScale;
    case "rad_rats":
    case "glow_hounds":
      return 0.9 * o.mutantScale;
    case "rad_cloud":
      return game.weather.next || game.weather.kind === "rad_cloud" ? 0 : 0.7 * o.radCloudScale;
  }
}

/** Spawn point on a walkable map edge tile, away from home. */
export function edgeSpawn(game: Game): { x: number; y: number } {
  const { w, h } = game.map;
  for (let tries = 0; tries < 200; tries++) {
    const side = game.aiRng.int(0, 3);
    const t = game.aiRng.int(2, (side % 2 ? h : w) - 3);
    const [x, y] = side === 0 ? [t, 1] : side === 1 ? [w - 2, t] : side === 2 ? [t, h - 2] : [1, t];
    if (game.walkable(0, x, y) && game.path.canReach({ layer: 0, x, y }, game.home)) return { x, y };
  }
  return { x: 1, y: 1 };
}

function spawnGroup(game: Game, kind: "raid" | "rad_rats" | "glow_hounds", size: number) {
  const id = game.newId();
  game.groups.set(id, { id, kind, size, fleeing: false, arrived: game.tick });
  const at = edgeSpawn(game);
  const creature = kind === "raid" ? "human" : kind === "rad_rats" ? "rad_rat" : "glow_hound";
  const weapons = ["pipe", "machete", "pipe_pistol", "pipe_pistol", "crossbow", "scrap_shotgun"];
  for (let i = 0; i < size; i++) {
    let x = at.x, y = at.y;
    for (let k = 0; k < 10; k++) {
      const nx = at.x + game.aiRng.int(-2, 2), ny = at.y + game.aiRng.int(-2, 2);
      if (game.walkable(0, nx, ny)) {
        x = nx;
        y = ny;
        break;
      }
    }
    const weapon = kind === "raid" ? game.aiRng.pick(weapons) : null;
    const p = makeHostile(game, creature, kind === "raid" ? "raiders" : "wild", 0, x, y, id, weapon);
    game.pawns.set(p.id, p);
  }
}

export function fireEvent(game: Game, kind: EventKind): void {
  const s = game.story;
  s.log.push({ tick: game.tick, event: kind });
  switch (kind) {
    case "raid": {
      const size = Math.max(2, Math.min(7, Math.floor(1 + s.points / 3)));
      spawnGroup(game, "raid", size);
      game.message("msg.raid", { n: size }, "bad");
      break;
    }
    case "rad_rats": {
      const size = Math.min(10, 4 + Math.floor(s.points));
      spawnGroup(game, "rad_rats", size);
      game.message("msg.rad_rats", { n: size }, "bad");
      break;
    }
    case "glow_hounds": {
      const size = Math.max(2, Math.min(5, Math.floor(s.points / 2)));
      spawnGroup(game, "glow_hounds", size);
      game.message("msg.glow_hounds", { n: size }, "bad");
      break;
    }
    case "rad_cloud":
      scheduleRadCloud(game, 12);
      break;
  }
}

function goodEvent(game: Game) {
  const s = game.story;
  const colonists = [...game.pawns.values()].filter((p) => p.faction === "colony");
  if (colonists.length < 8 && game.aiRng.chance(0.5)) {
    const at = edgeSpawn(game);
    const p = makeSurvivor(game, 0, at.x, at.y, new Set(colonists.flatMap((c) => [c.first, c.nick])));
    game.pawns.set(p.id, p);
    for (const c of game.pawns.values()) if (c.faction === "colony") addMemory(game, c, "wanderer_joined");
    game.message("msg.wanderer", { name: p.nick }, "info");
    s.log.push({ tick: game.tick, event: "wanderer" });
  } else {
    const loot: [string, number][] = [["canned_food", 15], ["clean_water", 15], ["scrap", 40], ["components", 3], ["bandage", 6], ["cloth", 15]];
    const [item, n] = game.aiRng.pick(loot);
    const x = game.home.x + game.aiRng.int(-8, 8), y = game.home.y + game.aiRng.int(-8, 8);
    dropItems(game, item, n, 0, x, y);
    game.message("msg.cargo", { count: n, item }, "info");
    s.log.push({ tick: game.tick, event: "cargo" });
  }
  s.lastGood = game.tick;
}

/** Called every tick; decides a few times per day. */
export function tickStoryteller(game: Game): void {
  const tpd = game.ticksPerDay;
  const checksPerDay = 4;
  if (game.tick % Math.round(tpd / checksPerDay) !== 0 || game.tick === 0) return;
  const style = STYLE[game.opts.storyteller];
  const s = game.story;
  const day = game.tick / tpd;
  s.points += (style.pointsPerDay * (1 + day * 0.06)) / checksPerDay;
  if (day < GRACE_DAYS) return;

  if (game.aiRng.chance(style.goodChance / checksPerDay) && game.tick - s.lastGood > tpd * 2) goodEvent(game);

  if (game.tick - s.lastThreat < style.calmDays * tpd) return;
  if (game.groups.size > 0) return;
  // Pick an affordable threat by weight. Saving up is fine: bigger raids later.
  const kinds: EventKind[] = ["raid", "rad_rats", "glow_hounds", "rad_cloud"];
  const options = kinds.filter((k) => s.points >= cost(game, k) && weight(game, k) > 0);
  if (!options.length || !game.aiRng.chance(0.45)) return;
  const total = options.reduce((n, k) => n + weight(game, k), 0);
  let r = game.aiRng.next() * total;
  let pick = options[0];
  for (const k of options) {
    r -= weight(game, k);
    if (r <= 0) {
      pick = k;
      break;
    }
  }
  // Hounds only come at night: wait for the evening check.
  if (pick === "glow_hounds" && game.hourOfDay > 6 && game.hourOfDay < 18) return;
  fireEvent(game, pick);
  s.points -= cost(game, pick);
  s.lastThreat = game.tick;
}
