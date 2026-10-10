/**
 * Storylines (spec 07, Beta B1). The player picks one storyline at the start. A storyline is a chain
 * of beats from content (story.json). A beat starts with effects (messages, story sites on the world
 * map, a named robot, items, raids), has a goal (all its conditions), and ends with effects. The last
 * beat's `win` effect ends the story: the UI shows ending slides, then the player may play on.
 * With nobody left, the story is lost and the UI shows an obituary.
 */
import type { StoryCondition, StoryEffect } from "@wc/data";
import { changeGoodwill, factionDef } from "./factions.ts";
import type { Game } from "./game.ts";
import { countItems, dropItems, takeFromStack } from "./items.ts";
import type { Pawn } from "./pawn.ts";
import { makeRobot } from "./robots.ts";
import { edgeSpawn, spawnRaid } from "./storyteller.ts";
import { ensureWorld } from "./world.ts";

export interface Plot {
  line: string | null;
  beat: number;
  /** Tick the current beat started. */
  beatStart: number;
  flags: string[];
  /** Story site keys an expedition reached. */
  visited: string[];
  won?: string;
  lost?: boolean;
}

export function newPlot(line: string | null): Plot {
  return { line, beat: 0, beatStart: 0, flags: [], visited: [], ...(line ? {} : {}) };
}

export function storyDef(game: Game) {
  return game.plot.line ? game.reg.content.story.find((s) => s.id === game.plot.line) : undefined;
}

/** The beat in progress, or null (no storyline, or finished). */
export function currentBeat(game: Game) {
  const s = storyDef(game);
  if (!s || game.plot.won || game.plot.lost) return null;
  return s.beats[game.plot.beat] ?? null;
}

const people = (game: Game) => [...game.pawns.values()].filter((p) => p.faction === "colony" && !p.robot);

export function conditionMet(game: Game, c: StoryCondition): boolean {
  switch (c.type) {
    case "days":
      return game.tick / game.ticksPerDay >= (c.n ?? 0);
    case "beat_days":
      return (game.tick - game.plot.beatStart) / game.ticksPerDay >= (c.n ?? 0);
    case "research":
      return game.research.done.has(c.id!);
    case "items":
      return countItems(game, c.id!) >= (c.n ?? 1);
    case "built":
      return [...game.things.values()].filter((t) => game.reg.things.list[t.def].id === c.id).length >= (c.n ?? 1);
    case "visited":
      return game.plot.visited.includes(c.id!);
    case "outpost":
      return !!ensureWorld(game).sites.find((s) => s.storyKey === c.id)?.outpost;
    case "flag":
      return game.plot.flags.includes(c.id!);
    case "people":
      return people(game).length >= (c.n ?? 1);
    case "calm":
      return game.groups.size === 0;
  }
}

/** Progress of a beat's goal as "done of total" conditions (for the UI). */
export function beatProgress(game: Game): { done: number; total: number } {
  const b = currentBeat(game);
  if (!b) return { done: 0, total: 0 };
  return { done: b.until.filter((c) => conditionMet(game, c)).length, total: b.until.length };
}

function applyEffect(game: Game, e: StoryEffect): void {
  switch (e.type) {
    case "message":
      game.message(e.key!, {}, e.level ?? "info");
      break;
    case "site": {
      // A story location on the world map, at a distance band from home; its loot is found on the first visit.
      const world = ensureWorld(game);
      if (world.sites.some((s) => s.storyKey === e.id)) break;
      const rng = game.rng.fork(`site:${e.id}`);
      const [lo, hi] = e.dist ?? [4, 9];
      let x = world.home.x, y = world.home.y;
      for (let k = 0; k < 200; k++) {
        const a = rng.next() * Math.PI * 2, d = lo + rng.next() * (hi - lo);
        x = Math.round(world.home.x + Math.cos(a) * d);
        y = Math.round(world.home.y + Math.sin(a) * d);
        if (x >= 1 && y >= 1 && x < world.w - 1 && y < world.h - 1 && !world.sites.some((s) => s.x === x && s.y === y)) break;
      }
      world.sites.push({ id: Math.max(0, ...world.sites.map((s) => s.id)) + 1, x, y, kind: (e.kind ?? "ruins") as never, richness: 0.8, danger: e.danger ?? 0.3, storyKey: e.id, storyLoot: { ...(e.items ?? {}) } });
      game.message("msg.story_site", { site: `story.site.${e.id}` }, "info");
      break;
    }
    case "robot": {
      const at = edgeSpawn(game);
      const bot = makeRobot(game, e.kind ?? "robot", 0, at.x, at.y);
      if (e.name) bot.nick = e.name;
      game.pawns.set(bot.id, bot);
      break;
    }
    case "items":
      for (const [item, n] of Object.entries(e.items ?? {})) dropItems(game, item, n, 0, game.home.x + 2, game.home.y + 2);
      break;
    case "take":
      for (const [item, n] of Object.entries(e.items ?? {})) {
        let left = n;
        for (const s of [...game.items.values()]) {
          if (left <= 0) break;
          if (s.layer >= 0 && game.reg.items.list[s.def].id === item) left -= takeFromStack(game, s.id, left);
        }
      }
      break;
    case "flag":
      if (!game.plot.flags.includes(e.id!)) game.plot.flags.push(e.id!);
      break;
    case "raid": {
      const f = factionDef(game, e.id!);
      if (f) spawnRaid(game, f, e.n ?? 3);
      break;
    }
    case "goodwill":
      changeGoodwill(game, e.id!, e.n ?? 0);
      break;
    case "win":
      game.plot.won = e.id ?? game.plot.line ?? "win";
      game.message("msg.story_won", {}, "info");
      break;
  }
}

/** Start the storyline's first beat (call once after the map is made). */
export function startPlot(game: Game, line: string | null): void {
  game.plot = newPlot(line);
  game.plot.beatStart = game.tick;
  const b = currentBeat(game);
  if (b) for (const e of b.start) applyEffect(game, e);
}

/** Once per in-game hour: finish beats whose goal is met, start the next; notice a lost colony. */
export function tickPlot(game: Game): void {
  if (game.tick % Math.round(game.ticksPerHour) !== 0) return;
  // Lost: nobody at home and nobody away.
  if (!game.plot.lost && !game.plot.won && game.tick > 0 && !people(game).length && !game.expeditions.some((x) => x.pawns.length)) {
    game.plot.lost = true;
    game.message("msg.colony_lost", {}, "bad");
    return;
  }
  for (let guard = 0; guard < 5; guard++) {
    const b = currentBeat(game);
    if (!b || !b.until.every((c) => conditionMet(game, c))) return;
    for (const e of b.done) applyEffect(game, e);
    if (game.plot.won) return;
    game.plot.beat++;
    game.plot.beatStart = game.tick;
    const next = currentBeat(game);
    if (next) {
      game.message("msg.story_beat", { beat: `story.${game.plot.line}.${next.id}` }, "info");
      for (const e of next.start) applyEffect(game, e);
    }
  }
}

/** A team reached a story site: mark it visited. (Called from the expedition code.) */
export function visitStorySite(game: Game, key: string): void {
  if (!game.plot.visited.includes(key)) game.plot.visited.push(key);
}

// ---------------------------------------------------------------- ending slides

export interface Slide {
  name: string;
  /** i18n key and params for the line about this survivor. */
  key: string;
  params: Record<string, string | number>;
}

/** One slide per survivor (living, then the dead), made from what they did. */
export function endingSlides(game: Game): Slide[] {
  const out: Slide[] = [];
  const living = [...game.pawns.values(), ...game.expeditions.flatMap((x) => x.pawns)].filter((p) => p.faction === "colony" && !p.robot);
  for (const p of living) out.push(slideFor(game, p));
  for (const d of game.deaths.filter((x) => x.faction === "colony")) out.push({ name: d.name, key: "ending.dead", params: { day: Math.floor(d.tick / game.ticksPerDay) + 1, cause: `cause.${d.cause}` } });
  return out;
}

function slideFor(game: Game, p: Pawn): Slide {
  const s = p.stats ?? {};
  const name = p.nick;
  // The thing they did most decides the line.
  const deeds: [string, number][] = [
    ["kills", s.kills ?? 0],
    ["rescues", (s.rescues ?? 0) * 3],
    ["built", (s.built ?? 0) / 8],
    ["crafted", (s.crafted ?? 0) / 4],
  ];
  deeds.sort((a, b) => b[1] - a[1]);
  const [deed, score] = deeds[0];
  const trait = p.traits.length ? game.reg.traits.list[p.traits[0]].id : null;
  if (score <= 0) return { name, key: trait ? `ending.trait.${trait}` : "ending.quiet", params: { name } };
  return { name, key: `ending.${deed}`, params: { name, n: Math.round(deed === "built" ? s.built ?? 0 : deed === "crafted" ? s.crafted ?? 0 : deed === "rescues" ? s.rescues ?? 0 : s.kills ?? 0) } };
}
