/**
 * Power (spec 05 "Power"). Power things and wires that touch (4-way) form one network.
 * Each network balances supply and demand: extra power charges batteries, a shortage drains them,
 * and when both run out every consumer on the network loses power (brownout).
 * Generators burn fuel that survivors bring.
 */
import { atGoal, findItem, goTo, isReserved, reserve } from "./ai.ts";
import { setTurretReady } from "./combat.ts";
import type { Game } from "./game.ts";
import { registerJob, registerWorkGiver } from "./jobs.ts";
import { NO_THING, type Thing } from "./map.ts";
import { pickUp } from "./hauling.ts";

const POWER_EVERY = 20;

export interface PowerNet {
  id: number;
  things: number[];
  produce: number;
  use: number;
  stored: number;
  capacity: number;
}

function powerish(game: Game, t: Thing): boolean {
  const d = game.reg.things.list[t.def];
  return !!d.power || d.conduit;
}

/** Rebuild networks by flood fill when power things change. */
export function ensureNets(game: Game): void {
  if (game.netsVersion === game.powerVersion) return;
  const nets: PowerNet[] = [];
  const seen = new Set<number>();
  for (const t of game.things.values()) {
    if (seen.has(t.id) || !powerish(game, t)) continue;
    const net: PowerNet = { id: nets.length, things: [], produce: 0, use: 0, stored: 0, capacity: 0 };
    const stack = [t];
    seen.add(t.id);
    while (stack.length) {
      const c = stack.pop()!;
      net.things.push(c.id);
      const L = game.map.layers[c.layer];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = c.x + dx, y = c.y + dy;
        if (!L.inBounds(x, y)) continue;
        const nid = L.thing[L.i(x, y)];
        if (nid === NO_THING || seen.has(nid)) continue;
        const n = game.things.get(nid)!;
        if (!powerish(game, n)) continue;
        seen.add(nid);
        stack.push(n);
      }
    }
    nets.push(net);
  }
  game.nets = nets;
  game.netOf.clear();
  for (const n of nets) for (const id of n.things) game.netOf.set(id, n.id);
  game.netsVersion = game.powerVersion;
}

export function tickPower(game: Game): void {
  ensureNets(game);
  if (game.tick % POWER_EVERY !== 0) return;
  const dtH = POWER_EVERY / game.ticksPerHour;
  for (const net of game.nets) {
    let produce = 0, use = 0, stored = 0, capacity = 0;
    const gens: Thing[] = [], batteries: Thing[] = [], users: Thing[] = [];
    for (const id of net.things) {
      const t = game.things.get(id);
      if (!t) continue;
      const p = game.reg.things.list[t.def].power;
      if (!p) continue;
      if (p.produce) {
        if (!p.fuel || (t.fuel ?? 0) > 0) {
          produce += p.produce;
          gens.push(t);
        }
      }
      if (p.use) {
        use += p.use;
        users.push(t);
      }
      if (p.store) {
        stored += t.charge ?? 0;
        capacity += p.store;
        batteries.push(t);
      }
    }
    // Burn fuel in proportion to the load (an idle generator burns a little).
    const load = produce > 0 ? Math.min(1, Math.max(0.1, use / produce)) : 0;
    for (const g of gens) {
      const f = game.reg.things.list[g.def].power!.fuel;
      if (f) g.fuel = Math.max(0, (g.fuel ?? 0) - f.perHour * dtH * load);
    }
    // Balance: surplus charges batteries, shortage drains them.
    const delta = (produce - use) * dtH;
    let ok = true;
    if (delta >= 0) stored = Math.min(capacity, stored + delta);
    else if (stored + delta >= 0) stored += delta;
    else {
      ok = false;
      stored = 0;
    }
    // Spread the charge evenly over the batteries.
    for (const b of batteries) b.charge = capacity ? (stored * game.reg.things.list[b.def].power!.store) / capacity : 0;
    for (const u of users) u.powered = ok;
    Object.assign(net, { produce, use, stored, capacity });
  }
}

export function isPowered(game: Game, t: Thing): boolean {
  const p = game.reg.things.list[t.def].power;
  return !p?.use || !!t.powered;
}

// Turrets need power (spec 06): hook into combat.
setTurretReady((game, t) => isPowered(game, t));

// ---------------------------------------------------------------- refueling

registerWorkGiver({
  workType: "haul",
  give(game, p) {
    for (const t of game.things.values()) {
      const f = game.reg.things.list[t.def].power?.fuel;
      if (!f || (t.fuel ?? 0) > f.capacity * 0.5 || isReserved(game, `thing:${t.id}`, p)) continue;
      if (!game.path.canReachAdjacent(p, t)) continue;
      const fuelDef = game.reg.items.idx(f.item);
      const src = findItem(game, p, (d, cont) => d === fuelDef && !cont);
      if (src === null) continue;
      if (!reserve(game, `thing:${t.id}`, p)) continue;
      if (!reserve(game, `item:${src}`, p)) {
        game.reservations.delete(`thing:${t.id}`);
        continue;
      }
      return { kind: "refuel", stage: 0, targetId: t.id, data: { src } };
    }
    return null;
  },
});

registerJob("refuel", (game, p, job) => {
  const gen = game.things.get(job.targetId!);
  if (!gen) return "fail";
  const f = game.reg.things.list[gen.def].power!.fuel!;
  if (job.stage === 0) {
    const s = game.items.get(job.data!.src as number);
    if (!s || !goTo(game, p, s)) return "fail";
    job.stage = 1;
  }
  if (job.stage === 1) {
    if (!atGoal(p)) return "run";
    const want = Math.ceil(f.capacity - (gen.fuel ?? 0));
    if (pickUp(game, p, job.data!.src as number, want) <= 0) return "fail";
    if (!goTo(game, p, gen, true)) return "fail";
    job.stage = 2;
  }
  if (!atGoal(p) || !p.carrying) return p.carrying ? "run" : "fail";
  const add = Math.min(p.carrying.count, Math.ceil(f.capacity - (gen.fuel ?? 0)));
  gen.fuel = (gen.fuel ?? 0) + add;
  p.carrying.count -= add;
  if (p.carrying.count <= 0) p.carrying = null;
  return "done";
});
