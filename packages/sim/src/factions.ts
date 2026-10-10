/**
 * Factions and trade (spec 12, Alpha A9). Each faction has goodwill toward the colony (-100..100).
 * Below HOSTILE_AT it can raid, with its own weapons and traits. Trader factions send caravans that
 * stay about a day near home; the player buys and sells by item value (the trader adds a markup that
 * shrinks with goodwill). Gifts, fair trades and released prisoners raise goodwill; recruiting or
 * capturing its people lowers it.
 */
import type { FactionDef } from "@wc/data";
import type { Game } from "./game.ts";
import { leave } from "./hostile.ts";
import { countItems, dropItems, takeFromStack } from "./items.ts";
import { goTo } from "./ai.ts";
import { makeSurvivor, type Pawn } from "./pawn.ts";

export const HOSTILE_AT = -25;
export const ALLY_AT = 50;
const CARAVAN_HOURS = 24;

export interface Caravan {
  faction: string;
  stock: Record<string, number>;
  leaveAt: number;
  pawnIds: number[];
}

export function factionDef(game: Game, id: string): FactionDef | undefined {
  return game.reg.content.factions.find((f) => f.id === id);
}

export function goodwill(game: Game, id: string): number {
  return game.goodwill[id] ?? factionDef(game, id)?.goodwill ?? 0;
}

export function relationOf(game: Game, id: string): "hostile" | "neutral" | "ally" {
  const g = goodwill(game, id);
  return g < HOSTILE_AT ? "hostile" : g >= ALLY_AT ? "ally" : "neutral";
}

/** Change goodwill; tells the player when the faction turns hostile, neutral or ally. */
export function changeGoodwill(game: Game, id: string, delta: number): void {
  if (!factionDef(game, id) || delta === 0) return;
  const before = relationOf(game, id);
  game.goodwill[id] = Math.max(-100, Math.min(100, goodwill(game, id) + delta));
  const after = relationOf(game, id);
  if (after !== before) game.message(`msg.faction_${after}`, { faction: id }, after === "hostile" ? "bad" : "info");
}

/** A faction that may raid now (random among the hostile ones), or null. */
export function raidingFaction(game: Game): FactionDef | null {
  const hostile = game.reg.content.factions.filter((f) => relationOf(game, f.id) === "hostile");
  return hostile.length ? game.aiRng.pick(hostile) : null;
}

/** Gear a raider for its faction. */
export function equipRaider(game: Game, p: Pawn, f: FactionDef): void {
  p.origin = f.id;
  if (f.weapons.length) p.weapon = game.reg.items.idx(game.aiRng.pick(f.weapons));
  p.traits = f.traits.filter((t) => game.reg.traits.has(t)).map((t) => game.reg.traits.idx(t));
}

/** Value of items by id. */
export function valueOf(game: Game, items: Record<string, number>): number {
  return Object.entries(items).reduce((a, [id, n]) => a + (game.reg.items.has(id) ? game.reg.items.get(id).value * n : 0), 0);
}

/** The trader's price factor: 1.3 at goodwill 0, less with friends, more with enemies. */
export function markup(game: Game, id: string): number {
  return Math.max(1.05, 1.3 - goodwill(game, id) / 400);
}

/** A trader caravan arrives from a friendly or neutral trader faction. Returns false if none can come. */
export function sendCaravan(game: Game, at: { x: number; y: number }): boolean {
  if (game.caravan) return false;
  const traders = game.reg.content.factions.filter((f) => f.kind === "trader" && relationOf(game, f.id) !== "hostile");
  if (!traders.length) return false;
  const f = game.aiRng.pick(traders);
  const stock: Record<string, number> = {};
  for (const [item, [lo, hi]] of Object.entries(f.sells)) {
    const n = game.aiRng.int(lo, hi);
    if (n > 0 && game.reg.items.has(item)) stock[item] = n;
  }
  const pawnIds: number[] = [];
  for (let i = 0; i < 2; i++) {
    const p = makeSurvivor(game, 0, at.x, at.y, new Set());
    p.faction = "trader";
    p.origin = f.id;
    p.weapon = game.reg.items.idx("pipe_pistol");
    game.pawns.set(p.id, p);
    pawnIds.push(p.id);
  }
  game.caravan = { faction: f.id, stock, leaveAt: game.tick + CARAVAN_HOURS * game.ticksPerHour, pawnIds };
  game.message("msg.caravan", { faction: f.id }, "info", { layer: 0, ...at });
  return true;
}

/** Traders walk to near home and wait; when the time is up they leave. */
export function traderTick(game: Game, p: Pawn): void {
  const c = game.caravan;
  if (!c || game.tick >= c.leaveAt || !c.pawnIds.includes(p.id)) {
    leave(game, p);
    if (c && !c.pawnIds.some((id) => game.pawns.has(id))) game.caravan = null;
    return;
  }
  const spot = { layer: 0, x: game.home.x + 4 + (p.id % 2), y: game.home.y + 4 };
  if (!p.path?.length && Math.hypot(p.x - spot.x, p.y - spot.y) > 2) goTo(game, p, spot);
}

/** Take items from colony stores (anywhere on the map, chests too). */
function takeFromColony(game: Game, item: string, n: number): number {
  const def = game.reg.items.idx(item);
  let left = n;
  for (const s of [...game.items.values()]) {
    if (left <= 0) break;
    if (s.def !== def || s.layer < 0 || s.contaminated) continue;
    left -= takeFromStack(game, s.id, left);
  }
  return n - left;
}

export type TradeProblem = "no_caravan" | "not_enough_value" | "missing_items" | "trader_short" | null;

/** Can this trade happen? Buying costs the markup; selling pays the plain value. */
export function checkTrade(game: Game, buy: Record<string, number>, sell: Record<string, number>): TradeProblem {
  const c = game.caravan;
  if (!c) return "no_caravan";
  if (Object.entries(buy).some(([id, n]) => (c.stock[id] ?? 0) < n)) return "trader_short";
  if (Object.entries(sell).some(([id, n]) => countItems(game, id) < n)) return "missing_items";
  if (valueOf(game, sell) < valueOf(game, buy) * markup(game, c.faction) - 1e-6) return "not_enough_value";
  return null;
}

/** Trade with the caravan. With nothing bought, it is a gift. */
export function trade(game: Game, buy: Record<string, number>, sell: Record<string, number>): TradeProblem {
  const problem = checkTrade(game, buy, sell);
  if (problem) return problem;
  const c = game.caravan!;
  for (const [id, n] of Object.entries(sell)) {
    const got = takeFromColony(game, id, n);
    c.stock[id] = (c.stock[id] ?? 0) + got;
  }
  const trader = c.pawnIds.map((id) => game.pawns.get(id)).find(Boolean);
  const at = trader ?? { layer: 0, x: game.home.x + 3, y: game.home.y + 3 };
  for (const [id, n] of Object.entries(buy)) {
    c.stock[id] -= n;
    if (c.stock[id] <= 0) delete c.stock[id];
    dropItems(game, id, n, at.layer, at.x, at.y);
  }
  const gift = Object.keys(buy).length === 0;
  const value = valueOf(game, sell);
  changeGoodwill(game, c.faction, gift ? Math.min(20, value / 15) : value / 150);
  game.message(gift ? "msg.gift" : "msg.traded", { faction: c.faction }, "info");
  return null;
}
