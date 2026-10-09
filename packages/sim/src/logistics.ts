/**
 * Logistics (spec 05): conveyor belts, loaders and the auto-crafter.
 * A belt tile holds one cargo packet that moves to the next tile in its facing.
 * A loader moves items from the ground tile behind it onto the belt or crafter in front.
 * An auto-crafter runs a recipe from its input buffer while powered and puts the product in front.
 */
import type { RecipeDef } from "@wc/data";
import { atGoal, findItem, goTo, isReserved, reserve } from "./ai.ts";
import { matchesInput, recipesFor } from "./bills.ts";
import type { Game } from "./game.ts";
import { dropItems, takeFromStack } from "./items.ts";
import { registerJob, registerWorkGiver } from "./jobs.ts";
import { NO_THING, type Thing } from "./map.ts";
import { pickUp } from "./hauling.ts";
import { isPowered } from "./power.ts";

export const DIRS4: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const PACKET_MAX = 10;
const LOADER_EVERY = 15;
/** Auto-crafter work per tick (a skill-7 survivor does about 0.8). */
const CRAFTER_RATE = 0.8;

export function front(t: Thing): { x: number; y: number } {
  const [dx, dy] = DIRS4[t.rot ?? 0];
  return { x: t.x + dx, y: t.y + dy };
}

export function behind(t: Thing): { x: number; y: number } {
  const [dx, dy] = DIRS4[t.rot ?? 0];
  return { x: t.x - dx, y: t.y - dy };
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

/** Try to hand items to whatever is on a tile. Returns how many were accepted. */
function offer(game: Game, layer: number, x: number, y: number, def: number, count: number, contaminated: boolean): number {
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
  if (t && d?.blocks) return 0;
  if (!game.walkable(layer, x, y)) return 0;
  // Open ground: the belt drops its load there.
  return count - dropItems(game, def, count, layer, x, y, contaminated);
}

export function tickLogistics(game: Game): void {
  const belts: Thing[] = [], loaders: Thing[] = [], crafters: Thing[] = [];
  for (const t of game.things.values()) {
    const d = game.reg.things.list[t.def];
    if (d.belt) belts.push(t);
    else if (d.loader) loaders.push(t);
    else if (d.autoCrafter) crafters.push(t);
  }
  // Belts: move cargo forward.
  for (const b of belts) {
    if (!b.cargo || !isPowered(game, b)) continue;
    const speed = game.reg.things.list[b.def].belt! / game.ticksPerHour;
    b.cargo.progress = Math.min(1, b.cargo.progress + speed);
    if (b.cargo.progress < 1) continue;
    const f = front(b);
    const n = offer(game, b.layer, f.x, f.y, b.cargo.def, b.cargo.count, !!b.cargo.contaminated);
    b.cargo.count -= n;
    if (b.cargo.count <= 0) b.cargo = null;
  }

  // Loaders: ground stack behind -> belt or crafter in front.
  if (game.tick % LOADER_EVERY === 0) {
    for (const l of loaders) {
      if (!isPowered(game, l)) continue;
      const b = behind(l), f = front(l);
      const L = game.map.layers[l.layer];
      if (!L.inBounds(b.x, b.y)) continue;
      const sid = L.item[L.i(b.x, b.y)];
      if (sid === NO_THING) continue;
      const s = game.items.get(sid)!;
      const n = offer(game, l.layer, f.x, f.y, s.def, Math.min(5, s.count), !!s.contaminated);
      if (n > 0) takeFromStack(game, sid, n);
    }
  }

  // Auto-crafters: work while powered and supplied.
  for (const c of crafters) {
    if (!isPowered(game, c)) continue;
    const r = crafterRecipe(game, c);
    if (!r) continue;
    const ready = r.inputs.every((i) => (c.buffer?.[game.reg.items.idx(i.item!)] ?? 0) >= i.count);
    if (!ready) continue;
    c.work = (c.work ?? 0) + CRAFTER_RATE;
    if (c.work < r.work) continue;
    c.work = 0;
    for (const i of r.inputs) c.buffer![game.reg.items.idx(i.item!)] -= i.count;
    const f = front(c);
    for (const [item, n] of Object.entries(r.output)) {
      const def = game.reg.items.idx(item);
      const placed = offer(game, c.layer, f.x, f.y, def, n, false);
      if (placed < n) dropItems(game, def, n - placed, c.layer, c.x, c.y);
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
