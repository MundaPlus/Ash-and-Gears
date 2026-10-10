/**
 * A simple scripted player for headless playtests. It does what a new player would do in the first
 * days: a stockpile, a farm, a walled room with beds and a campfire, salvage and wood cutting,
 * a chest for food, a research desk, power and a lamp once researched, more farms as the colony grows, sandbags
 * in front of the door, and in an attack everyone drafts and gathers behind the sandbags.
 */
import {
  canPlace,
  createZone,
  designate,
  fertilityAt,
  NO_THING,
  orderMove,
  placeBlueprint,
  researchState,
  setDrafted,
  setResearch,
  type Game,
} from "../../packages/sim/src/index.ts";

interface Plan {
  room?: { x: number; y: number; size: number };
  stage: number;
  farms: number;
  /** Enemies were near at the last check (to give gather orders once per attack). */
  alarm: boolean;
}

const RESEARCH_ORDER = ["rain_catchers", "scrap_power", "electric_lights", "field_medicine", "batteries", "turret_wiring", "gunsmithing", "powered_tools", "smelting", "conveyors"];

/** Find the top-left of a free square (buildable, no things) near home. */
function findSquare(game: Game, size: number, minDist = 3): { x: number; y: number } | null {
  const L = game.map.layers[0];
  const { x: hx, y: hy } = game.home;
  for (let r = minDist; r < 40; r++) {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x0 = hx + dx, y0 = hy + dy;
        let ok = true;
        for (let y = y0; y < y0 + size && ok; y++)
          for (let x = x0; x < x0 + size && ok; x++) {
            if (!L.inBounds(x, y)) ok = false;
            else {
              const i = L.i(x, y);
              const td = game.reg.terrain.list[L.terrain[i]];
              ok = !td.solid && td.buildable && L.thing[i] === NO_THING && L.zone[i] === NO_THING && L.blueprint[i] === NO_THING && !td.water;
            }
          }
        if (ok) return { x: x0, y: y0 };
      }
  }
  return null;
}

function fertileSquare(game: Game, size: number): { x: number; y: number }[] {
  const L = game.map.layers[0];
  const { x: hx, y: hy } = game.home;
  let best: { x: number; y: number; score: number } | null = null;
  for (let y0 = hy - 25; y0 < hy + 25; y0 += 2)
    for (let x0 = hx - 25; x0 < hx + 25; x0 += 2) {
      let score = 0;
      for (let y = y0; y < y0 + size; y++)
        for (let x = x0; x < x0 + size; x++) {
          if (!L.inBounds(x, y) || L.thing[L.i(x, y)] !== NO_THING || L.zone[L.i(x, y)] !== NO_THING) continue;
          score += fertilityAt(game, 0, x, y);
        }
      if (!best || score > best.score) best = { x: x0, y: y0, score };
    }
  const tiles = [];
  if (best) for (let y = best.y; y < best.y + size; y++) for (let x = best.x; x < best.x + size; x++) tiles.push({ x, y });
  return tiles;
}

export function makeAutoplayer(game: Game) {
  const plan: Plan = { stage: 0, farms: 1, alarm: false };
  return function act() {
    const { x: hx, y: hy } = game.home;
    // Fight: draft everyone while enemies are around.
    const cols = [...game.pawns.values()].filter((p) => p.faction === "colony");
    const enemies = [...game.pawns.values()].some(
      (e) => e.faction !== "colony" && !e.health.downed && cols.some((c) => Math.hypot(c.x - e.x, c.y - e.y) < 20),
    );
    for (const p of game.pawns.values()) if (p.faction === "colony" && p.drafted !== enemies) setDrafted(game, p, enemies);
    if (enemies && !plan.alarm && plan.room && plan.stage >= 3) {
      // Gather in the row between the door and the sandbags, so everyone fights together from cover.
      const r = plan.room;
      cols.filter((c) => c.drafted).forEach((c, i) => orderMove(game, c, { layer: 0, x: r.x + 1 + (i % 5), y: r.y + 7 }));
    }
    plan.alarm = enemies;
    if (game.tick % Math.round(game.ticksPerHour * 2) !== 0) return;

    if (plan.stage === 0) {
      // Stockpile, farm, salvage and wood near home.
      const sp = findSquare(game, 4, 2);
      if (sp) {
        const tiles = [];
        for (let y = sp.y; y < sp.y + 4; y++) for (let x = sp.x; x < sp.x + 4; x++) tiles.push({ x, y });
        createZone(game, "stockpile", 0, tiles);
      }
      createZone(game, "grow", 0, fertileSquare(game, 6), undefined, "glowcorn_plant");
      for (const t of game.things.values()) {
        const d = game.reg.things.list[t.def];
        const dist = Math.hypot(t.x - hx, t.y - hy);
        if (t.layer === 0 && dist < 26 && (d.id === "car_wreck" || d.id === "scrap_pile" || d.id === "loot_crate")) designate(game, "salvage", 0, t.x, t.y);
        if (t.layer === 0 && dist < 30 && d.id === "dead_tree") designate(game, "cut", 0, t.x, t.y);
      }
      plan.stage = 1;
      return;
    }
    if (plan.stage === 1) {
      // A 7x7 wood-and-scrap room with a door, a campfire and beds.
      const spot = findSquare(game, 7, 4);
      if (!spot) return;
      plan.room = { ...spot, size: 7 };
      const { x: x0, y: y0 } = spot;
      let n = 0;
      for (let x = x0; x < x0 + 7; x++)
        for (let y = y0; y < y0 + 7; y++) {
          const edge = x === x0 || y === y0 || x === x0 + 6 || y === y0 + 6;
          if (!edge) continue;
          const door = x === x0 + 3 && y === y0 + 6;
          placeBlueprint(game, "thing", door ? "scrap_door" : n++ % 2 ? "wood_wall" : "scrap_wall", 0, x, y);
        }
      placeBlueprint(game, "thing", "campfire", 0, x0 + 3, y0 + 3);
      for (let i = 0; i < 3; i++) placeBlueprint(game, "thing", "bedroll", 0, x0 + 1 + i * 2, y0 + 1);
      // A well inside the room stays clean when a radiation cloud passes.
      placeBlueprint(game, "thing", "well", 0, x0 + 5, y0 + 5);
      // A chest in the room keeps food away from rats.
      placeBlueprint(game, "thing", "scrap_chest", 0, x0 + 1, y0 + 5);
      plan.stage = 2;
      return;
    }
    if (plan.stage === 2 && (game.blueprints.size === 0 || game.tick > game.ticksPerDay * 1.5)) {
      // A research desk outside the room.
      const r = plan.room!;
      for (const [x, y] of [[r.x + 7, r.y + 1], [r.x - 2, r.y + 1], [r.x + 1, r.y + 8]])
        if (canPlace(game, "thing", "research_desk", 0, x, y)) {
          placeBlueprint(game, "thing", "research_desk", 0, x, y);
          break;
        }
      placeBlueprint(game, "thing", "scrap_bench", 0, r.x + 7, r.y + 4);
      // Sandbags two tiles south of the door, with a gap in front of it.
      for (const dx of [0, 1, 2, 4, 5, 6]) placeBlueprint(game, "thing", "sandbags", 0, r.x + dx, r.y + 8);
      plan.stage = 3;
    }
    // More farms as the colony grows: potatoes keep for a month, corn grows fast.
    const day = game.tick / game.ticksPerDay;
    if (plan.stage >= 3 && plan.farms === 1 && day > 3) {
      createZone(game, "grow", 0, fertileSquare(game, 6), undefined, "scrub_potato_plant");
      plan.farms = 2;
    }
    if (plan.stage >= 3 && plan.farms === 2 && cols.length >= 5) {
      createZone(game, "grow", 0, fertileSquare(game, 6), undefined, "glowcorn_plant");
      plan.farms = 3;
    }
    if (plan.stage >= 3) {
      if (!game.research.current) {
        const next = RESEARCH_ORDER.find((id) => researchState(game, id) === "available");
        if (next) setResearch(game, next);
      }
      // Power and a lamp in the room once researched.
      if (plan.stage === 3 && game.research.done.has("electric_lights") && plan.room) {
        const r = plan.room;
        // Generator, wire and lamp in a row outside the west wall (wires cannot pass through walls).
        placeBlueprint(game, "thing", "scrap_generator", 0, r.x - 5, r.y + 3);
        placeBlueprint(game, "thing", "wire", 0, r.x - 3, r.y + 3);
        placeBlueprint(game, "thing", "lamp", 0, r.x - 2, r.y + 3);
        plan.stage = 4;
      }
      if (plan.stage === 4 && game.research.done.has("rain_catchers") && plan.room) {
        const r = plan.room;
        placeBlueprint(game, "thing", "rain_collector", 0, r.x + 8, r.y + 7);
        plan.stage = 5;
      }
    }
  };
}
