/**
 * Logistics (spec 05, Alpha A1): belts, splitters, sorters, underground belts, loaders, robot arms,
 * chests and the auto-crafter.
 * A belt tile holds one cargo packet that moves to the next tile in its facing.
 * Loaders and arms take from the tile behind them (ground, belt, chest, crafter output) and put
 * on the tile in front (belt, crafter input, chest, ground). Arms can be set to one item.
 * An auto-crafter runs a recipe from its input buffer while powered; products wait in its output
 * buffer until the tile in front or an arm takes them.
 */
import type { RecipeDef } from "@wc/data";
import { atGoal, findItem, goTo, isReserved, reserve } from "./ai.ts";
import { billTarget, matchesInput, recipesFor, stockOf } from "./bills.ts";
import type { Game } from "./game.ts";
import { chestStacks, dropItems, putInChest, takeFromStack } from "./items.ts";
import { registerJob, registerWorkGiver } from "./jobs.ts";
import { NO_THING, type Thing } from "./map.ts";
import { pickUp } from "./hauling.ts";
import { isPowered } from "./power.ts";

export const DIRS4: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const PACKET_MAX = 10;
const LOADER_EVERY = 15;
/** Items a loader or arm moves per swing. */
const SWING = 5;
/** Auto-crafter work per tick (a skill-7 survivor does about 0.8). */
const CRAFTER_RATE = 0.8;
/** How far an underground belt reaches (tiles ahead, counting the exit). */
export const TUNNEL_REACH = 5;

/** The tile `steps` ahead of a rotatable thing; `turn` 1 = its right side, 3 = its left, 2 = behind. */
export function ahead(t: Thing, steps = 1, turn = 0): { x: number; y: number } {
  const [dx, dy] = DIRS4[((t.rot ?? 0) + turn) % 4];
  return { x: t.x + dx * steps, y: t.y + dy * steps };
}

export function front(t: Thing): { x: number; y: number } {
  return ahead(t);
}

export function behind(t: Thing): { x: number; y: number } {
  return ahead(t, 1, 2);
}

function thingAt(game: Game, layer: number, x: number, y: number): Thing | null {
  const L = game.map.layers[layer];
  if (!L.inBounds(x, y)) return null;
  const id = L.thing[L.i(x, y)];
  return id === NO_THING ? null : game.things.get(id)!;
}

export function crafterRecipe(game: Game, t: Thing): RecipeDef | null {
  const list = recipesFor(game, game.reg.things.list[t.def].id).filter((r) => r.inputs.every((i) => i.item));
  return list.find((r) => r.id === t.recipe) ?? list[0] ?? null;
}

/** How many of item `def` the crafter still wants in its buffer (up to two batches). */
export function crafterWants(game: Game, t: Thing, def: number): number {
  const r = crafterRecipe(game, t);
  if (!r) return 0;
  const inp = r.inputs.find((i) => matchesInput(game, i, def));
  if (!inp) return 0;
  return Math.max(0, inp.count * 2 - (t.buffer?.[def] ?? 0));
}

const total = (r?: Record<number, number>) => Object.values(r ?? {}).reduce((a, b) => a + b, 0);

/**
 * Bench sides (big machines): the output side faces south when not turned, the input side north.
 * Both turn with the bench. Returns the outside tiles along that side.
 */
export function benchSide(game: Game, t: Thing, side: "in" | "out"): { x: number; y: number }[] {
  const [dx, dy] = DIRS4[((t.rot ?? 0) + (side === "out" ? 1 : 3)) % 4];
  const cover = game.footprint(t.def, t.x, t.y, t.rot);
  const inside = new Set(cover.map((f) => `${f.x},${f.y}`));
  return cover.map((f) => ({ x: f.x + dx, y: f.y + dy })).filter((n) => !inside.has(`${n.x},${n.y}`));
}

/** True if a belt, chest, loader or arm sits on the bench's output side (products then go out there). */
export function benchFeedsOut(game: Game, t: Thing): boolean {
  return benchSide(game, t, "out").some((pos) => {
    const o = thingAt(game, t.layer, pos.x, pos.y);
    const d = o ? game.reg.things.list[o.def] : null;
    return !!d && (!!d.belt || !!d.chest || d.loader || d.arm);
  });
}

/** How many of item `def` a bench takes into its input buffer: two batches for any bill that is still short. */
export function benchWants(game: Game, t: Thing, def: number): number {
  const benchId = game.reg.things.list[t.def].id;
  let want = 0;
  for (const r of recipesFor(game, benchId)) {
    if (stockOf(game, r) >= billTarget(game, t, r)) continue;
    for (const inp of r.inputs) if (matchesInput(game, inp, def)) want = Math.max(want, inp.count * 2);
  }
  return Math.max(0, want - (t.buffer?.[def] ?? 0));
}

/** Try to hand items to whatever is on a tile. Returns how many were accepted. */
export function offer(game: Game, layer: number, x: number, y: number, def: number, count: number, contaminated: boolean): number {
  const t = thingAt(game, layer, x, y);
  const d = t ? game.reg.things.list[t.def] : null;
  if (t && d?.belt) {
    if (!t.cargo) {
      const n = Math.min(count, PACKET_MAX);
      t.cargo = { def, count: n, progress: 0, ...(contaminated ? { contaminated } : {}) };
      return n;
    }
    if (t.cargo.def === def && t.cargo.progress < 0.5 && t.cargo.count < PACKET_MAX) {
      const n = Math.min(count, PACKET_MAX - t.cargo.count);
      t.cargo.count += n;
      return n;
    }
    return 0;
  }
  if (t && d?.autoCrafter) {
    const n = Math.min(count, crafterWants(game, t, def));
    if (n > 0) t.buffer = { ...(t.buffer ?? {}), [def]: (t.buffer?.[def] ?? 0) + n };
    return n;
  }
  if (t && d?.chest) return putInChest(game, t, def, count, contaminated);
  if (t && d?.bench && !contaminated) {
    const n = Math.min(count, benchWants(game, t, def));
    if (n > 0) t.buffer = { ...(t.buffer ?? {}), [def]: (t.buffer?.[def] ?? 0) + n };
    return n;
  }
  // Loaders and arms are machines, not floor space.
  if (t && (d?.blocks || d?.loader || d?.arm)) return 0;
  if (!game.walkable(layer, x, y)) return 0;
  // Open ground: the belt drops its load there.
  return count - dropItems(game, def, count, layer, x, y, contaminated);
}

/**
 * What can be taken from a tile: an item kind and how many, or null. `only` limits it to one item.
 * `stack` is the item stack to take from (ground or chest).
 */
function peek(game: Game, layer: number, x: number, y: number, only?: number): { def: number; count: number; contaminated: boolean; stack?: number } | null {
  const t = thingAt(game, layer, x, y);
  const d = t ? game.reg.things.list[t.def] : null;
  const pick = (r?: Record<number, number>) => {
    for (const [k, n] of Object.entries(r ?? {})) if (n > 0 && (only === undefined || Number(k) === only)) return { def: Number(k), count: n, contaminated: false };
    return null;
  };
  if (t && d?.belt) {
    // Only packets that reached the middle of the tile can be lifted off.
    const c = t.cargo;
    return c && c.progress >= 0.5 && (only === undefined || c.def === only) ? { def: c.def, count: c.count, contaminated: !!c.contaminated } : null;
  }
  if (t && d?.chest) {
    const s = chestStacks(game, t).find((c) => only === undefined || c.def === only);
    return s ? { def: s.def, count: s.count, contaminated: !!s.contaminated, stack: s.id } : null;
  }
  if (t && (d?.autoCrafter || d?.bench)) return pick(t.out);
  if (t && (d?.blocks || d?.loader || d?.arm)) return null;
  const L = game.map.layers[layer];
  const sid = L.item[L.i(x, y)];
  if (sid === NO_THING) return null;
  const s = game.items.get(sid)!;
  return only === undefined || s.def === only ? { def: s.def, count: s.count, contaminated: !!s.contaminated, stack: s.id } : null;
}

/** Remove `n` of item `def` from a tile (after peek said they are there; `stack` from peek). */
function take(game: Game, layer: number, x: number, y: number, def: number, n: number, stack?: number): void {
  const t = thingAt(game, layer, x, y);
  const d = t ? game.reg.things.list[t.def] : null;
  const from = (r: Record<number, number>) => {
    r[def] -= n;
    if (r[def] <= 0) delete r[def];
  };
  if (t && d?.belt && t.cargo) {
    t.cargo.count -= n;
    if (t.cargo.count <= 0) t.cargo = null;
  } else if (t && (d?.autoCrafter || d?.bench) && t.out) from(t.out);
  else if (stack !== undefined) takeFromStack(game, stack, n);
}

/** One swing of a loader or arm: up to SWING items from behind to front. */
function swing(game: Game, l: Thing): void {
  const b = behind(l), f = front(l);
  if (!game.map.layers[l.layer].inBounds(b.x, b.y)) return;
  const got = peek(game, l.layer, b.x, b.y, l.filter);
  if (!got) return;
  const n = offer(game, l.layer, f.x, f.y, got.def, Math.min(SWING, got.count), got.contaminated);
  if (n > 0) take(game, l.layer, b.x, b.y, got.def, n, got.stack);
}

/**
 * The other end of an underground belt: for an entrance the first exit ahead with the same facing
 * (at most TUNNEL_REACH tiles), for an exit the entrance that leads to it. Null if none.
 */
export function tunnelPartner(game: Game, t: Thing): Thing | null {
  const kind = game.reg.things.list[t.def].beltKind;
  if (kind !== "tunnel_in" && kind !== "tunnel_out") return null;
  const want = kind === "tunnel_in" ? "tunnel_out" : "tunnel_in";
  for (let k = 1; k <= TUNNEL_REACH; k++) {
    const pos = ahead(t, k, kind === "tunnel_in" ? 0 : 2);
    const o = thingAt(game, t.layer, pos.x, pos.y);
    if (o && game.reg.things.list[o.def].beltKind === want && (o.rot ?? 0) === (t.rot ?? 0)) return kind === "tunnel_in" || tunnelPartner(game, o) === t ? o : null;
  }
  return null;
}

/** Where a belt tile sends its packet next, in order of preference. */
function outputs(game: Game, b: Thing): { x: number; y: number }[] {
  const kind = game.reg.things.list[b.def].beltKind;
  if (kind === "tunnel_in") {
    const exit = tunnelPartner(game, b);
    return [exit ? { x: exit.x, y: exit.y } : front(b)];
  }
  if (kind === "sort") return b.filter === undefined || b.cargo?.def === b.filter ? [front(b)] : [ahead(b, 1, 1)];
  if (kind === "split") {
    const all = [front(b), ahead(b, 1, 3), ahead(b, 1, 1)];
    const i = b.splitNext ?? 0;
    return [...all.slice(i), ...all.slice(0, i)];
  }
  return [front(b)];
}

export function tickLogistics(game: Game): void {
  const belts: Thing[] = [], loaders: Thing[] = [], crafters: Thing[] = [];
  for (const t of game.things.values()) {
    const d = game.reg.things.list[t.def];
    if (d.belt) belts.push(t);
    else if (d.loader || d.arm) loaders.push(t);
    else if (d.autoCrafter) crafters.push(t);
    else if (d.bench && t.out && game.tick % LOADER_EVERY === 0) {
      // Bench products go out to belts and chests on the output side (arms also lift them out).
      for (const pos of benchSide(game, t, "out"))
        for (const [k, n] of Object.entries(t.out)) {
          const o = thingAt(game, t.layer, pos.x, pos.y);
          const od = o ? game.reg.things.list[o.def] : null;
          if (!od || !(od.belt || od.chest)) continue;
          const placed = offer(game, t.layer, pos.x, pos.y, Number(k), n, false);
          if (placed > 0) take(game, t.layer, t.x, t.y, Number(k), placed);
        }
    }
  }
  // Belts: move cargo forward.
  for (const b of belts) {
    if (!b.cargo || !isPowered(game, b)) continue;
    const def = game.reg.things.list[b.def];
    const speed = def.belt! / game.ticksPerHour;
    b.cargo.progress = Math.min(1, b.cargo.progress + speed);
    if (b.cargo.progress < 1) continue;
    const outs = outputs(game, b);
    for (let i = 0; i < outs.length && b.cargo; i++) {
      const n = offer(game, b.layer, outs[i].x, outs[i].y, b.cargo.def, b.cargo.count, !!b.cargo.contaminated);
      b.cargo.count -= n;
      if (b.cargo.count <= 0) b.cargo = null;
      // A splitter turns to its next output after each packet it hands on.
      if (n > 0 && def.beltKind === "split") {
        b.splitNext = ((b.splitNext ?? 0) + i + 1) % 3;
        break;
      }
    }
  }

  // Loaders and arms: one swing every LOADER_EVERY ticks.
  if (game.tick % LOADER_EVERY === 0) for (const l of loaders) if (isPowered(game, l)) swing(game, l);

  // Auto-crafters: work while powered and supplied, and while the output has room.
  for (const c of crafters) {
    // Products go out to the tile in front when it takes them.
    const f = front(c);
    for (const [k, n] of Object.entries(c.out ?? {})) {
      const placed = offer(game, c.layer, f.x, f.y, Number(k), n, false);
      if (placed > 0) take(game, c.layer, c.x, c.y, Number(k), placed);
    }
    if (!isPowered(game, c)) continue;
    const r = crafterRecipe(game, c);
    if (!r) continue;
    const ready = r.inputs.every((i) => (c.buffer?.[game.reg.items.idx(i.item!)] ?? 0) >= i.count);
    const batch = Object.values(r.output).reduce((a, b) => a + b, 0);
    if (!ready || total(c.out) >= batch * 2) continue;
    c.work = (c.work ?? 0) + CRAFTER_RATE;
    if (c.work < r.work) continue;
    c.work = 0;
    for (const i of r.inputs) c.buffer![game.reg.items.idx(i.item!)] -= i.count;
    c.out ??= {};
    for (const [item, n] of Object.entries(r.output)) {
      const def = game.reg.items.idx(item);
      c.out[def] = (c.out[def] ?? 0) + n;
    }
  }
}

export function setCrafterRecipe(game: Game, t: Thing, recipe: string): void {
  // Changing the recipe gives back the old buffer.
  for (const [def, n] of Object.entries(t.buffer ?? {})) if (n > 0) dropItems(game, Number(def), n, t.layer, t.x, t.y);
  t.buffer = {};
  t.work = 0;
  t.recipe = recipe;
}

/** Sorter belts and arms: set the one item they handle (undefined = everything). */
export function setFilter(game: Game, t: Thing, item: string | null): void {
  if (item === null) delete t.filter;
  else t.filter = game.reg.items.idx(item);
}

/** Things removed with items inside give them back on the ground. */
export function spillContents(game: Game, t: Thing): void {
  for (const s of chestStacks(game, t)) {
    game.items.delete(s.id);
    dropItems(game, s.def, s.count, t.layer, t.x, t.y, !!s.contaminated, s.contamUntil);
  }
  for (const r of [t.out, t.buffer]) for (const [k, n] of Object.entries(r ?? {})) if (n > 0) dropItems(game, Number(k), n, t.layer, t.x, t.y);
  if (t.cargo) dropItems(game, t.cargo.def, t.cargo.count, t.layer, t.x, t.y, !!t.cargo.contaminated);
}

// ---------------------------------------------------------------- survivors fill crafters

registerWorkGiver({
  workType: "haul",
  give(game, p) {
    for (const t of game.things.values()) {
      if (!game.reg.things.list[t.def].autoCrafter || isReserved(game, `thing:${t.id}`, p)) continue;
      const r = crafterRecipe(game, t);
      if (!r || !game.path.canReachAdjacent(p, t)) continue;
      for (const inp of r.inputs) {
        const def = game.reg.items.idx(inp.item!);
        // Only top up when nearly empty, so belts get the first chance.
        if ((t.buffer?.[def] ?? 0) >= inp.count) continue;
        const src = findItem(game, p, (d, cont) => d === def && !cont);
        if (src === null) continue;
        if (!reserve(game, `thing:${t.id}`, p)) return null;
        if (!reserve(game, `item:${src}`, p)) {
          game.reservations.delete(`thing:${t.id}`);
          return null;
        }
        return { kind: "load_crafter", stage: 0, targetId: t.id, data: { src, def } };
      }
    }
    return null;
  },
});

registerJob("load_crafter", (game, p, job) => {
  const c = game.things.get(job.targetId!);
  if (!c) return "fail";
  const def = job.data!.def as number;
  if (job.stage === 0) {
    const s = game.items.get(job.data!.src as number);
    if (!s || !goTo(game, p, s)) return "fail";
    job.stage = 1;
  }
  if (job.stage === 1) {
    if (!atGoal(p)) return "run";
    if (pickUp(game, p, job.data!.src as number, crafterWants(game, c, def)) <= 0) return "fail";
    if (!goTo(game, p, c, true)) return "fail";
    job.stage = 2;
  }
  if (!atGoal(p) || !p.carrying) return p.carrying ? "run" : "fail";
  const n = Math.min(p.carrying.count, crafterWants(game, c, def));
  c.buffer = { ...(c.buffer ?? {}), [def]: (c.buffer?.[def] ?? 0) + n };
  p.carrying.count -= n;
  if (p.carrying.count <= 0) p.carrying = null;
  return "done";
});
