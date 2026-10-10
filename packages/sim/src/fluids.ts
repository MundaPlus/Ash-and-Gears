/**
 * Pipes and fluids (spec 12, Alpha A2). Pipes and fluid things that touch (4-way) form one network,
 * like power. The liters live on the things themselves (Thing.liquid), so a network is only a
 * grouping: its amount is the sum, its room the sum of capacities. Fluids: "water" (dirty) and
 * "clean_water". A pump fills its network from a water tile next to it. A purifier sits between two
 * networks: water from its input side becomes clean water on its output side. Survivors drink clean
 * water at taps. A fuel still's bills put fuel into its network, and generators that touch a pipe
 * network with fuel fill up from it (1 liter = 1 fuel unit).
 */
import type { Game } from "./game.ts";
import { benchSide } from "./logistics.ts";
import { NO_THING, type Thing } from "./map.ts";
import { isPowered } from "./power.ts";

export type Fluid = "water" | "clean_water" | "fuel";
const FLUIDS_EVERY = 20;
/** Liters a pipe tile holds. */
const PIPE_CAPACITY = 10;
/** Liters of clean water for a full drink (thirst 0 to 1). */
export const LITERS_PER_DRINK = 10;

export interface FluidNet {
  id: number;
  things: number[];
}

/** Part of a fluid network: pipes and fluid things, except purifiers (they join two networks). */
function fluidish(game: Game, t: Thing): boolean {
  const d = game.reg.things.list[t.def];
  return d.pipe || (!!d.fluid && d.fluid.role !== "purifier");
}

/** Liters a thing can hold. */
export function capacityOf(game: Game, t: Thing): number {
  const d = game.reg.things.list[t.def];
  if (d.pipe) return PIPE_CAPACITY;
  return d.fluid?.capacity ?? (d.fluid ? PIPE_CAPACITY : 0);
}

const held = (t: Thing) => Object.values(t.liquid ?? {}).reduce((a, b) => a + b, 0);

/** Rebuild networks by flood fill when pipes or fluid things change. */
export function ensureFluidNets(game: Game): void {
  if (game.fluidNetsVersion === game.fluidVersion) return;
  const nets: FluidNet[] = [];
  const seen = new Set<number>();
  for (const t of game.things.values()) {
    if (seen.has(t.id) || !fluidish(game, t)) continue;
    const net: FluidNet = { id: nets.length, things: [] };
    const stack = [t];
    seen.add(t.id);
    while (stack.length) {
      const c = stack.pop()!;
      net.things.push(c.id);
      const L = game.map.layers[c.layer];
      for (const f of game.footprint(c.def, c.x, c.y, c.rot))
        for (const [x, y] of [[f.x + 1, f.y], [f.x - 1, f.y], [f.x, f.y + 1], [f.x, f.y - 1]]) {
          if (!L.inBounds(x, y)) continue;
          const nid = L.thing[L.i(x, y)];
          if (nid === NO_THING || seen.has(nid)) continue;
          const n = game.things.get(nid)!;
          if (!fluidish(game, n)) continue;
          seen.add(nid);
          stack.push(n);
        }
    }
    nets.push(net);
  }
  game.fluidNets = nets;
  game.fluidNetOf.clear();
  for (const n of nets) for (const id of n.things) game.fluidNetOf.set(id, n.id);
  game.fluidNetsVersion = game.fluidVersion;
}

/** The network a thing belongs to, or the one on a tile (for purifier sides). */
export function fluidNetOf(game: Game, t: Thing): FluidNet | null {
  ensureFluidNets(game);
  return game.fluidNets[game.fluidNetOf.get(t.id) ?? -1] ?? null;
}

function netAt(game: Game, layer: number, x: number, y: number): FluidNet | null {
  const L = game.map.layers[layer];
  if (!L.inBounds(x, y)) return null;
  const id = L.thing[L.i(x, y)];
  return id === NO_THING ? null : fluidNetOf(game, game.things.get(id)!);
}

const members = (game: Game, net: FluidNet) => net.things.map((id) => game.things.get(id)!).filter(Boolean);

/** Liters of a fluid in a network. */
export function netAmount(game: Game, net: FluidNet, kind: Fluid): number {
  return members(game, net).reduce((a, t) => a + (t.liquid?.[kind] ?? 0), 0);
}

/** Free liters in a network (all fluids share the room). */
export function netRoom(game: Game, net: FluidNet): number {
  return members(game, net).reduce((a, t) => a + Math.max(0, capacityOf(game, t) - held(t)), 0);
}

/** Add up to `liters` of a fluid. Returns how much went in. */
export function netAdd(game: Game, net: FluidNet, kind: Fluid, liters: number): number {
  let left = liters;
  for (const t of members(game, net)) {
    if (left <= 0) break;
    const n = Math.min(left, capacityOf(game, t) - held(t));
    if (n <= 0) continue;
    t.liquid = { ...(t.liquid ?? {}), [kind]: (t.liquid?.[kind] ?? 0) + n };
    left -= n;
  }
  return liters - left;
}

/** Take up to `liters` of a fluid. Returns how much came out. */
export function netDraw(game: Game, net: FluidNet, kind: Fluid, liters: number): number {
  let left = liters;
  for (const t of members(game, net)) {
    if (left <= 0) break;
    const have = t.liquid?.[kind] ?? 0;
    const n = Math.min(left, have);
    if (n <= 0) continue;
    t.liquid![kind] = have - n;
    if (t.liquid![kind] <= 1e-9) delete t.liquid![kind];
    left -= n;
  }
  return liters - left;
}

/** The water a pump stands next to: "clean_water", "water" (dirty), or null (none, or toxic). */
export function pumpSource(game: Game, t: Thing): Fluid | null {
  const L = game.map.layers[t.layer];
  let found: Fluid | null = null;
  for (const f of game.footprint(t.def, t.x, t.y, t.rot))
    for (const [x, y] of [[f.x + 1, f.y], [f.x - 1, f.y], [f.x, f.y + 1], [f.x, f.y - 1]]) {
      if (!L.inBounds(x, y)) continue;
      const w = game.reg.terrain.list[L.terrain[L.i(x, y)]].water;
      if (w === "clean") return "clean_water";
      if (w === "dirty") found = "water";
    }
  return found;
}

export function tickFluids(game: Game): void {
  ensureFluidNets(game);
  if (game.tick % FLUIDS_EVERY !== 0) return;
  const dtH = FLUIDS_EVERY / game.ticksPerHour;
  for (const t of game.things.values()) {
    const f = game.reg.things.list[t.def].fluid;
    if (!f || !f.rate || !isPowered(game, t)) continue;
    if (f.role === "pump") {
      // Surface water carries fallout after a radiation cloud: pumps shut off until it clears.
      if (t.layer === 0 && game.openWaterContamUntil > game.tick) continue;
      const src = pumpSource(game, t);
      const net = fluidNetOf(game, t);
      if (src && net) netAdd(game, net, src, f.rate * dtH);
    } else if (f.role === "purifier") {
      const ins = benchSide(game, t, "in").map((p) => netAt(game, t.layer, p.x, p.y)).filter((n): n is FluidNet => !!n);
      const outs = benchSide(game, t, "out").map((p) => netAt(game, t.layer, p.x, p.y)).filter((n): n is FluidNet => !!n);
      const from = ins[0], to = outs[0];
      if (!from || !to || from === to) continue;
      const n = Math.min(f.rate * dtH, netAmount(game, from, "water"), netRoom(game, to));
      if (n > 0) netAdd(game, to, "clean_water", netDraw(game, from, "water", n));
    }
  }
  // Generators next to a pipe network with fuel top up from it.
  for (const t of game.things.values()) {
    const f = game.reg.things.list[t.def].power?.fuel;
    if (!f || (t.fuel ?? 0) > f.capacity - 1) continue;
    for (const net of touchingNets(game, t)) {
      const got = netDraw(game, net, "fuel", f.capacity - (t.fuel ?? 0));
      t.fuel = (t.fuel ?? 0) + got;
      if (t.fuel > f.capacity - 1) break;
    }
  }
}

/** Fluid networks on the tiles around a thing (for things that are not part of a network). */
export function touchingNets(game: Game, t: Thing): FluidNet[] {
  const out = new Set<FluidNet>();
  for (const f of game.footprint(t.def, t.x, t.y, t.rot))
    for (const [x, y] of [[f.x + 1, f.y], [f.x - 1, f.y], [f.x, f.y + 1], [f.x, f.y - 1]]) {
      const n = netAt(game, t.layer, x, y);
      if (n && !game.fluidNetOf.has(t.id)) out.add(n);
    }
  return [...out];
}

/** Liters of a fluid in all networks (the "stock" for fuel bills). */
export function totalFluid(game: Game, kind: Fluid): number {
  ensureFluidNets(game);
  return game.fluidNets.reduce((a, n) => a + netAmount(game, n, kind), 0);
}

/** A tap with enough clean water for a drink of `liters`. */
export function tapHasWater(game: Game, t: Thing, liters = 1): boolean {
  const net = fluidNetOf(game, t);
  return !!net && netAmount(game, net, "clean_water") >= liters;
}
