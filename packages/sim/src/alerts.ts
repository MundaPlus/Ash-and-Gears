/**
 * Alerts (quality of life): problems the player should see at a glance, with a place to jump to.
 * Food and water: days left for the people at home. Beds: survivors without one. Idle: survivors
 * with nothing to do. Power: machines without power. Wounds: survivors with untended wounds.
 */
import type { Game } from "./game.ts";
import { untendedInjuries } from "./health.ts";
import { isPowered } from "./power.ts";
import { NEED_DECAY } from "./pawn.ts";

export interface Alert {
  key: string;
  params: Record<string, string | number>;
  level: "warn" | "bad";
  at?: { layer: number; x: number; y: number };
}

/** Days of clean food and water left at home (nutrition / hydration units over daily need). */
export function daysLeft(game: Game): { food: number; water: number } {
  const people = [...game.pawns.values()].filter((p) => p.faction === "colony" && !p.robot).length + [...game.pawns.values()].filter((p) => p.faction === "prisoner").length;
  if (!people) return { food: Infinity, water: Infinity };
  let food = 0, water = 0;
  for (const s of game.items.values()) {
    if (s.layer < 0 || s.contaminated) continue;
    const d = game.reg.items.list[s.def];
    if (d.category === "food") food += s.count * d.nutrition;
    if (d.category === "water") water += s.count * d.hydration;
  }
  return { food: food / (people * NEED_DECAY.hunger), water: water / (people * NEED_DECAY.thirst) };
}

export function computeAlerts(game: Game): Alert[] {
  const out: Alert[] = [];
  const people = [...game.pawns.values()].filter((p) => p.faction === "colony" && !p.robot);
  if (!people.length) return out;
  const left = daysLeft(game);
  // A well, tap or rain collector makes water less urgent.
  const waterSource = [...game.things.values()].some((t) => game.reg.things.list[t.def].water === "clean" || !!game.reg.things.list[t.def].rainCollect);
  if (left.food < 2) out.push({ key: "alert.food_low", params: { days: Math.max(0, Math.floor(left.food * 10) / 10) }, level: left.food < 1 ? "bad" : "warn" });
  if (left.water < 1.5 && !waterSource) out.push({ key: "alert.water_low", params: { days: Math.max(0, Math.floor(left.water * 10) / 10) }, level: left.water < 0.7 ? "bad" : "warn" });
  const beds = [...game.things.values()].filter((t) => game.reg.things.list[t.def].bed && !t.forPrisoners && !t.medical).length;
  if (beds < people.length) out.push({ key: "alert.no_beds", params: { n: people.length - beds }, level: "warn" });
  const idle = people.filter((p) => !p.drafted && !p.mentalBreak && !p.health.downed && p.job?.kind === "wander" && !p.job.data?.sulk);
  if (idle.length) out.push({ key: "alert.idle", params: { names: idle.map((p) => p.nick).join(", ") }, level: "warn", at: idle[0] });
  // Drafted survivors do not eat or drink until it is critical: warn early.
  const starving = people.find((p) => p.drafted && (p.needs.thirst < 0.3 || p.needs.hunger < 0.3));
  if (starving) out.push({ key: "alert.drafted_needs", params: { name: starving.nick }, level: starving.needs.thirst < 0.15 || starving.needs.hunger < 0.15 ? "bad" : "warn", at: starving });
  const hurt = people.find((p) => untendedInjuries(p).length > 0);
  if (hurt) out.push({ key: "alert.wounds", params: { name: hurt.nick }, level: hurt.health.downed ? "bad" : "warn", at: hurt });
  // A raider is marked for capture, but no bed is set for prisoners: the warden cannot take them.
  const captive = [...game.pawns.values()].find((p) => p.capture && p.health.downed);
  const freePrisonBed = [...game.things.values()].some((t) => t.forPrisoners && ![...game.pawns.values()].some((o) => o.faction === "prisoner" && o.bedId === t.id));
  if (captive && !freePrisonBed) out.push({ key: "alert.no_prison_bed", params: { name: captive.nick }, level: "warn", at: captive });
  const dark = [...game.things.values()].filter((t) => game.reg.things.list[t.def].power?.use && !isPowered(game, t));
  if (dark.length) out.push({ key: "alert.unpowered", params: { n: dark.length }, level: "warn", at: dark[0] });
  return out.map((a) => (a.at ? { ...a, at: { layer: a.at.layer, x: a.at.x, y: a.at.y } } : a));
}

/** Food warning level last told to the player: 0 enough, 1 low, 2 nearly gone. */
const foodTold = new WeakMap<Game, number>();

/**
 * Once an hour: tell the player (a message with a sound) when food at home falls under 2 days, and
 * again under half a day. It only warns again after the stock has come back above 3 days.
 */
export function tickFoodWarning(game: Game): void {
  if (game.tick % game.ticksPerHour !== 0) return;
  if (![...game.pawns.values()].some((p) => p.faction === "colony" && !p.robot)) return;
  const days = daysLeft(game).food;
  const told = foodTold.get(game) ?? 0;
  const level = days < 0.5 ? 2 : days < 2 ? 1 : 0;
  if (level > told) {
    const ripe = [...game.things.values()].filter((t) => (t.growth ?? 0) >= 1 && !!game.reg.things.list[t.def].crop).length;
    game.message(level === 2 ? "msg.food_critical" : "msg.food_low", { days: Math.floor(days * 10) / 10, ripe }, level === 2 ? "bad" : "warn");
    foodTold.set(game, level);
  } else if (days >= 3 && told) foodTold.set(game, 0);
}
