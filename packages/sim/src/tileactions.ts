/**
 * Tile actions (quality of life): what the player can do on one tile from the inspect panel,
 * and which one the F key does. Cancelling comes first; then mine, salvage, cut or clear.
 * Deconstruct is offered but never the default, so F cannot take down your own buildings.
 */
import { cancelBlueprint } from "./construction.ts";
import { canDesignate, designate, undesignate } from "./designations.ts";
import type { Game } from "./game.ts";
import { removeZoneTiles } from "./hauling.ts";
import { NO_THING, type DesigKind } from "./map.ts";

export type TileAction = DesigKind | "cancel_plan" | "cancel_order" | "remove_zone";

/** Actions possible on a tile, the default one first (or none is default when `first` is null). */
export function tileActions(game: Game, layer: number, x: number, y: number): { actions: TileAction[]; first: TileAction | null } {
  const L = game.map.layers[layer];
  if (!L.inBounds(x, y)) return { actions: [], first: null };
  const i = L.i(x, y);
  const actions: TileAction[] = [];
  if (L.blueprint[i] !== NO_THING) actions.push("cancel_plan");
  if (L.desig[i]) actions.push("cancel_order");
  else for (const k of ["mine", "salvage", "cut", "clear", "deconstruct"] as DesigKind[]) if (canDesignate(game, k, layer, x, y)) actions.push(k);
  if (L.zone[i] !== NO_THING) actions.push("remove_zone");
  const first = actions.find((a) => a !== "deconstruct" && a !== "remove_zone") ?? null;
  return { actions, first };
}

/** Do one tile action. Returns true if something changed. */
export function doTileAction(game: Game, layer: number, x: number, y: number, a: TileAction): boolean {
  const L = game.map.layers[layer];
  if (!L.inBounds(x, y)) return false;
  const i = L.i(x, y);
  switch (a) {
    case "cancel_plan":
      if (L.blueprint[i] === NO_THING) return false;
      cancelBlueprint(game, L.blueprint[i]);
      return true;
    case "cancel_order":
      if (!L.desig[i]) return false;
      undesignate(game, layer, x, y);
      return true;
    case "remove_zone":
      if (L.zone[i] === NO_THING) return false;
      removeZoneTiles(game, layer, [{ x, y }]);
      return true;
    default:
      return designate(game, a, layer, x, y);
  }
}
