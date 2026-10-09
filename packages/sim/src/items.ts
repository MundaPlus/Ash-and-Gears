/**
 * Item stacks on the ground. One stack per tile, like RimWorld.
 * Dropping more items than fit spills onto nearby free tiles.
 */
import type { Game } from "./game.ts";
import { NO_THING, type ItemStack } from "./map.ts";

export function stackLimit(game: Game, def: number): number {
  return game.reg.items.list[def].stack;
}

/** True if an item stack of `def` can be put on this tile (empty, or same item with room). */
export function canHoldItem(game: Game, layer: number, x: number, y: number, def: number, contaminated = false): boolean {
  const L = game.map.layers[layer];
  if (!L.inBounds(x, y) || !game.walkable(layer, x, y)) return false;
  const id = L.item[L.i(x, y)];
  if (id === NO_THING) return true;
  const s = game.items.get(id)!;
  return s.def === def && !!s.contaminated === contaminated && s.count < stackLimit(game, def);
}

/**
 * Place `count` items near (x, y). Spills outward in rings. Returns how many could not be placed
 * (0 in normal play; only a full map leaves items over).
 */
export function dropItems(game: Game, defId: string | number, count: number, layer: number, x: number, y: number, contaminated = false): number {
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
          s.count += add;
          count -= add;
        } else {
          const add = Math.min(count, limit);
          const s: ItemStack = { id: game.newId(), def, count: add, layer, x: tx, y: ty };
          if (contaminated) s.contaminated = true;
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
    L.item[L.i(s.x, s.y)] = NO_THING;
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
