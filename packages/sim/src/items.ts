/**
 * Item stacks on the ground. One stack per tile, like RimWorld.
 * Dropping more items than fit spills onto nearby free tiles.
 */
import type { Game } from "./game.ts";
import { NO_THING, type ItemStack, type Thing } from "./map.ts";

export function stackLimit(game: Game, def: number): number {
  return game.reg.items.list[def].stack;
}

/** True if an item stack of `def` can be put on this tile (empty, or same item with room). */
export function canHoldItem(game: Game, layer: number, x: number, y: number, def: number, contaminated = false): boolean {
  const L = game.map.layers[layer];
  if (!L.inBounds(x, y) || !game.walkable(layer, x, y)) return false;
  // Nothing lies loose on a chest tile: things go into the chest (putInChest) or beside it.
  if (game.thingDefAt(layer, x, y)?.chest) return false;
  const id = L.item[L.i(x, y)];
  if (id === NO_THING) return true;
  const s = game.items.get(id)!;
  return s.def === def && !!s.contaminated === contaminated && s.count < stackLimit(game, def);
}

/**
 * Place `count` items near (x, y). Spills outward in rings. Returns how many could not be placed
 * (0 in normal play; only a full map leaves items over).
 */
/** `add` items with rot `rot` join stack `s`: the stack's rot becomes the mean of both (before the count grows). */
export function mixRot(s: ItemStack, add: number, rot: number): void {
  const old = s.rot ?? 0;
  if (add <= 0 || (old === 0 && rot === 0)) return;
  s.rot = (old * s.count + rot * add) / (s.count + add);
}

export function dropItems(
  game: Game,
  defId: string | number,
  count: number,
  layer: number,
  x: number,
  y: number,
  contaminated = false,
  contamUntil?: number,
  /** Food: how far it has rotted (0..1). It stays with the food when it moves. */
  rot = 0,
): number {
  const def = typeof defId === "string" ? game.reg.items.idx(defId) : defId;
  const L = game.map.layers[layer];
  const limit = stackLimit(game, def);
  for (let r = 0; r <= 12 && count > 0; r++) {
    for (let dy = -r; dy <= r && count > 0; dy++) {
      for (let dx = -r; dx <= r && count > 0; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; // ring only
        const tx = x + dx, ty = y + dy;
        if (!canHoldItem(game, layer, tx, ty, def, contaminated)) continue;
        const i = L.i(tx, ty);
        const existing = L.item[i];
        if (existing !== NO_THING) {
          const s = game.items.get(existing)!;
          const add = Math.min(count, limit - s.count);
          mixRot(s, add, rot);
          s.count += add;
          count -= add;
        } else {
          const add = Math.min(count, limit);
          const s: ItemStack = { id: game.newId(), def, count: add, layer, x: tx, y: ty, ...(rot > 0 ? { rot } : {}) };
          if (contaminated) {
            s.contaminated = true;
            s.contamUntil = contamUntil ?? game.tick + game.opts.seasonDays * game.ticksPerDay;
          }
          game.items.set(s.id, s);
          L.item[i] = s.id;
          count -= add;
        }
        L.touch(tx, ty);
        game.mapVersion++;
      }
    }
  }
  return count;
}

/** Remove up to `count` items from a ground stack. Returns how many were taken. */
export function takeFromStack(game: Game, stackId: number, count: number): number {
  const s = game.items.get(stackId);
  if (!s) return 0;
  const n = Math.min(count, s.count);
  s.count -= n;
  const L = game.map.layers[s.layer];
  if (s.count <= 0) {
    if (s.chest === undefined) L.item[L.i(s.x, s.y)] = NO_THING;
    game.items.delete(stackId);
  }
  L.touch(s.x, s.y);
  game.mapVersion++;
  return n;
}

/** Total count of an item on the ground across the map (for the resource bar). */
export function countItems(game: Game, defId: string): number {
  const def = game.reg.items.idx(defId);
  let n = 0;
  for (const s of game.items.values()) if (s.def === def && s.layer >= 0) n += s.count;
  return n;
}

// ---------------------------------------------------------------- chests

/** The stacks inside a chest. */
export function chestStacks(game: Game, t: Thing): ItemStack[] {
  return [...game.items.values()].filter((s) => s.chest === t.id);
}

/** Items in a chest, all kinds together. */
export function chestCount(game: Game, t: Thing): number {
  return chestStacks(game, t).reduce((a, s) => a + s.count, 0);
}

/** Put items into a chest, up to its room. One stack per item kind (and contamination). Returns how many went in. */
export function putInChest(game: Game, t: Thing, def: number, count: number, contaminated = false, contamUntil?: number, rot = 0): number {
  const cap = game.reg.things.list[t.def].chest ?? 0;
  const stacks = chestStacks(game, t);
  const n = Math.min(count, cap - stacks.reduce((a, s) => a + s.count, 0));
  if (n <= 0) return 0;
  const same = stacks.find((s) => s.def === def && !!s.contaminated === contaminated);
  if (same) {
    mixRot(same, n, rot);
    same.count += n;
  } else {
    const s: ItemStack = { id: game.newId(), def, count: n, layer: t.layer, x: t.x, y: t.y, chest: t.id, ...(rot > 0 ? { rot } : {}) };
    if (contaminated) {
      s.contaminated = true;
      s.contamUntil = contamUntil ?? game.tick + game.opts.seasonDays * game.ticksPerDay;
    }
    game.items.set(s.id, s);
  }
  game.mapVersion++;
  return n;
}
