/**
 * Power (spec 05 "Power"). Power things and wires that touch (4-way) form one network.
 * Each network balances supply and demand: extra power charges batteries, a shortage drains them,
 * and when both run out every consumer on the network loses power (brownout).
 * Generators burn fuel that survivors bring.
 */
import { atGoal, findItem, goTo, isReserved, reserve } from "./ai.ts";
import { tunnelPartner } from "./logistics.ts";
import { setTurretReady } from "./combat.ts";
import type { Game } from "./game.ts";
import { registerJob, registerWorkGiver } from "./jobs.ts";
import { NO_THING, type Thing } from "./map.ts";
import { pickUp } from "./hauling.ts";
import { cookingWanted } from "./bills.ts";
import type { Job, Pawn } from "./pawn.ts";

const POWER_EVERY = 20;
/** A consumer's backup battery, in hours of its own use, unless the thing sets `bank`. */
const BACKUP_HOURS = 0.5;
/** A backup battery fills from empty in this many hours (when the network has power to spare). */
const BANK_FILL_HOURS = 4;

/** Power a consumer draws now (W): heaters and coolers draw in proportion to how hard they work. */
export function useOf(game: Game, t: Thing): number {
  const d = game.reg.things.list[t.def];
  const use = d.power?.use ?? 0;
  // A little standby draw keeps the thermostat awake.
  return d.thermostat ? use * Math.max(0.05, t.duty ?? 1) : use;
}

/** Size of a consumer's backup battery (Wh); 0 for things that use no power. */
export function bankSize(game: Game, t: Thing): number {
  const p = game.reg.things.list[t.def].power;
  if (!p?.use && !p?.bank) return 0;
  return p.bank ?? p.use * BACKUP_HOURS;
}

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
  // A switch that is off cuts the line.
  if (d.switch && t.off) return false;
  return !!d.power || d.conduit || (!!t.line && !!game.reg.things.get(t.line).conduit);
}

/** Poles this pole links to (other poles within range on the same layer). */
export function poleLinks(game: Game, t: Thing): Thing[] {
  const range = game.reg.things.list[t.def].pole;
  if (!range) return [];
  const out: Thing[] = [];
  for (const o of game.things.values()) {
    if (o.id === t.id || o.layer !== t.layer || !game.reg.things.list[o.def].pole) continue;
    const r = Math.min(range, game.reg.things.list[o.def].pole!);
    if ((o.x - t.x) ** 2 + (o.y - t.y) ** 2 <= r * r) out.push(o);
  }
  return out;
}

/** Output factor for solar and wind generators right now (0..1). */
export function sourceFactor(game: Game, t: Thing, source: "solar" | "wind"): number {
  const w = game.weather.kind;
  if (source === "solar") {
    if (game.map.layers[t.layer].underground) return 0;
    const h = game.hourOfDay;
    const sun = h > 6 && h < 19 ? Math.sin((Math.PI * (h - 6)) / 13) : 0;
    const sky = w === "clear" ? 1 : w === "overcast" ? 0.5 : w === "rad_cloud" ? 0.2 : 0.3;
    return sun * sky;
  }
  // Wind: slow gusts from a few waves, stronger in rain.
  const k = game.tick / game.ticksPerHour;
  const gust = 0.5 + 0.3 * Math.sin(k / 5 + t.x) + 0.2 * Math.sin(k / 1.7 + t.y);
  return Math.max(0.05, Math.min(1, gust * (w === "rain" || w === "toxic_rain" ? 1.3 : 1)));
}

/** A consumer's priority: the player's choice, else the def's (1 keep on .. 3 cut first). */
export function priorityOf(game: Game, t: Thing): number {
  return t.priority ?? game.reg.things.list[t.def].power?.priority ?? 2;
}

/** Turn a switch on or off (rebuilds the networks). */
export function setSwitch(game: Game, t: Thing, on: boolean): void {
  if (on) delete t.off;
  else t.off = true;
  game.powerVersion++;
  game.map.layers[t.layer].touch(t.x, t.y);
  game.mapVersion++;
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
      const nbs = game.footprint(c.def, c.x, c.y, c.rot).flatMap((f) => [[f.x + 1, f.y], [f.x - 1, f.y], [f.x, f.y + 1], [f.x, f.y - 1]]);
      for (const o of poleLinks(game, c)) nbs.push([o.x, o.y]);
      // An underground belt pair carries power under the ground, like a buried cable.
      const pair = tunnelPartner(game, c);
      if (pair) nbs.push([pair.x, pair.y]);
      for (const [x, y] of nbs) {
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
  // Fires burn their fuel all the time.
  for (const t of game.things.values()) {
    const b = game.reg.things.list[t.def].burns;
    if (b && !b.whileWorking && (t.fuel ?? 0) > 0) t.fuel = Math.max(0, t.fuel! - b.perHour * dtH);
  }
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
          produce += p.produce * (p.source ? sourceFactor(game, t, p.source) : 1);
          gens.push(t);
        }
      }
      if (p.use) {
        use += useOf(game, t);
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
    // Not enough from generators and batteries: cut consumers, priority 3 first, until the rest fits.
    const avail = produce + stored / dtH;
    let served = use;
    const cut = new Set<number>();
    if (use > avail) {
      served = 0;
      const byPriority = [...users].sort((a, b) => priorityOf(game, a) - priorityOf(game, b) || a.id - b.id);
      // Within one priority, smaller machines may still fit; after a cut, every later priority goes.
      let cutFrom = Infinity;
      for (const u of byPriority) {
        const w = useOf(game, u);
        const pr = priorityOf(game, u);
        if (pr <= cutFrom && served + w <= avail) served += w;
        else {
          cut.add(u.id);
          cutFrom = Math.min(cutFrom, pr);
        }
      }
      if (cut.size && !users.some((u) => cut.has(u.id) && u.powered === false) && game.tick - game.lastBlackoutMsg > game.ticksPerDay / 2) {
        game.message("msg.blackout", { n: cut.size }, "warn");
        game.lastBlackoutMsg = game.tick;
      }
    }
    // Cut machines run on their own backup battery while it lasts.
    for (const u of users) {
      u.onBank = false;
      if (!cut.has(u.id)) continue;
      const need = useOf(game, u) * dtH;
      if ((u.bank ?? 0) >= need) {
        u.bank! -= need;
        u.onBank = true;
        cut.delete(u.id);
      }
    }
    // Backup batteries fill next, from what is left (generators first, then the batteries).
    let spare = Math.max(0, avail - served);
    for (const u of users) {
      const size = bankSize(game, u);
      const add = Math.min(size - (u.bank ?? 0), (size / BANK_FILL_HOURS) * dtH, spare * dtH);
      if (add <= 0) continue;
      u.bank = (u.bank ?? 0) + add;
      spare -= add / dtH;
      served += add / dtH;
    }
    // Balance: surplus charges batteries, shortage drains them.
    stored = Math.max(0, Math.min(capacity, stored + (produce - served) * dtH));
    // Spread the charge evenly over the batteries.
    for (const b of batteries) b.charge = capacity ? (stored * game.reg.things.list[b.def].power!.store) / capacity : 0;
    for (const u of users) u.powered = !cut.has(u.id);
    Object.assign(net, { produce, use, stored, capacity });
  }
}

/** Fuel a thing takes: a generator's or a fire's (`burns`). */
export function fuelOf(game: Game, t: Thing) {
  const d = game.reg.things.list[t.def];
  return d.power?.fuel ?? d.burns;
}

/** Fires burn while they have fuel; things that burn nothing are always "lit". */
export function isLit(game: Game, t: Thing): boolean {
  return !game.reg.things.list[t.def].burns || (t.fuel ?? 0) > 0;
}

export function isPowered(game: Game, t: Thing): boolean {
  const p = game.reg.things.list[t.def].power;
  return !p?.use || !!t.powered;
}

// Turrets need power (spec 06): hook into combat.
setTurretReady((game, t) => isPowered(game, t));

// ---------------------------------------------------------------- refueling

/**
 * A refuel job for the first thing that needs fuel: below `below` of its capacity and passing `want`.
 * Fuel must lie somewhere the survivor can reach.
 */
export function refuelJob(game: Game, p: Pawn, below = 0.5, want: (t: Thing) => boolean = () => true): Job | null {
  for (const t of game.things.values()) {
    const f = fuelOf(game, t);
    if (!f || (t.fuel ?? 0) > f.capacity * below || !want(t) || isReserved(game, `thing:${t.id}`, p)) continue;
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
}

registerWorkGiver({ workType: "haul", give: (game, p) => refuelJob(game, p) });
// Within hauling, a fire or generator running low comes first.
registerWorkGiver({ workType: "haul", give: (game, p) => refuelJob(game, p, 0.25) }, true);

/**
 * Cooks light their own fire (user report: "the campfire never gets refueled, and cooks make no meals").
 * Refueling is haul work and hauling comes last, so a cook could stand by a cold campfire forever.
 */
registerWorkGiver({
  workType: "cook",
  // Only when there is something to cook (else a cook could spend the day feeding a fire for nothing).
  give: (game, p) => refuelJob(game, p, 0.25, (t) => !!game.reg.things.list[t.def].bench && cookingWanted(game, t)),
});

registerJob("refuel", (game, p, job) => {
  const gen = game.things.get(job.targetId!);
  if (!gen) return "fail";
  const f = fuelOf(game, gen)!;
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
