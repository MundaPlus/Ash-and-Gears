/**
 * Links between layers (user request: "make a check"). Runs on every new game and every load, so old
 * saves get repaired too:
 * - every stairs up has stairs down on the layer above, and every stairs down has stairs up below;
 * - the old bunker can be reached on foot: if no path leads from the surface stairs to its outer door,
 *   a cave tunnel leads from the stairs to an old service shaft, and a short tunnel below leads to the door.
 */
import { digDown } from "./construction.ts";
import type { Game } from "./game.ts";
import { NO_THING } from "./map.ts";

const idOf = (game: Game, def: number) => game.reg.things.list[def].id;
const goesDown = (game: Game, def: number) => (game.reg.things.list[def].stairs ?? 0) > 0;

export function ensureLinks(game: Game): void {
  repairStairs(game);
  if (game.map.layers.length >= 3 && !bunkerReachable(game)) connectBunker(game);
}

/** Put back missing halves of stairs. */
export function repairStairs(game: Game): void {
  for (const t of [...game.things.values()]) {
    // Stairs down without stairs up below: dig them in.
    if (goesDown(game, t.def) && t.layer + 1 < game.map.layers.length) {
      const below = game.map.layers[t.layer + 1];
      const b = below.thing[below.i(t.x, t.y)];
      if (b === NO_THING || idOf(game, game.things.get(b)!.def) !== "stairs_up") digDown(game, t.layer + 1, t.x, t.y);
    }
    // Stairs up without stairs down above: put them back (on the surface the plain stairs, below dug stairs).
    if (idOf(game, t.def) === "stairs_up" && t.layer >= 1) {
      const up = game.map.layers[t.layer - 1];
      const i = up.i(t.x, t.y);
      const a = up.thing[i];
      if (a !== NO_THING && goesDown(game, game.things.get(a)!.def)) continue;
      if (a !== NO_THING) game.removeThing(a);
      if (game.reg.terrain.list[up.terrain[i]].solid) game.setTerrain(t.layer - 1, t.x, t.y, t.layer - 1 === 0 ? "dirt" : "cave_floor");
      game.spawnThing(t.layer - 1 === 0 ? "stairs_down" : "dug_stairs", t.layer - 1, t.x, t.y);
    }
  }
}

function surfaceStairs(game: Game) {
  return [...game.things.values()]
    .filter((t) => t.layer === 0 && goesDown(game, t.def))
    .sort((a, b) => Math.abs(a.x - game.home.x) + Math.abs(a.y - game.home.y) - (Math.abs(b.x - game.home.x) + Math.abs(b.y - game.home.y)))[0];
}

/** The bunker's outer door: the westmost bunker door on layer 2. */
function bunkerDoor(game: Game) {
  const doors = [...game.things.values()].filter((t) => t.layer === 2 && idOf(game, t.def) === "bunker_door");
  return doors.length ? doors.reduce((a, b) => (b.x < a.x ? b : a)) : undefined;
}

function bunkerReachable(game: Game): boolean {
  const s = surfaceStairs(game), door = bunkerDoor(game);
  if (!s || !door) return true;
  return game.path.canReach({ layer: 0, x: s.x, y: s.y }, { layer: 2, x: door.x - 1, y: door.y });
}

/** Dig a walkable line on a layer: rock becomes floor, blocking junk goes (stairs and bunker walls stay). */
function carve(game: Game, layer: number, x0: number, y0: number, x1: number, y1: number, floor: string) {
  const L = game.map.layers[layer];
  for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
      if (!L.inBounds(x, y)) continue;
      const th = L.thing[L.i(x, y)];
      if (th !== NO_THING) {
        const d = game.reg.things.list[game.things.get(th)!.def];
        if (d.blocks && d.kind !== "stairs" && !d.id.startsWith("bunker")) game.removeThing(th);
      }
      if (game.reg.terrain.list[L.terrain[L.i(x, y)]].solid || game.reg.terrain.list[L.terrain[L.i(x, y)]].walkCost === 0) game.setTerrain(layer, x, y, floor);
    }
}

/** Cave tunnel from the surface stairs to a service shaft west of the bunker, then a tunnel to its door. */
export function connectBunker(game: Game): void {
  const s = surfaceStairs(game), door = bunkerDoor(game);
  if (!s || !door) return;
  const walls = [...game.things.values()].filter((t) => t.layer === 2 && idOf(game, t.def).startsWith("bunker"));
  const minY = Math.min(...walls.map((t) => t.y)), maxY = Math.max(...walls.map((t) => t.y));
  const shaft = { x: door.x - 4, y: door.y };
  // Layer 1: from below the surface stairs to the shaft (around the bunker's rows, which lie below).
  const row = s.y < (minY + maxY) / 2 ? Math.min(s.y, minY - 2) : Math.max(s.y, maxY + 2);
  carve(game, 1, s.x, s.y, s.x, row, "cave_floor");
  carve(game, 1, s.x, row, shaft.x, row, "cave_floor");
  carve(game, 1, shaft.x, row, shaft.x, shaft.y, "cave_floor");
  const L1 = game.map.layers[1];
  const at = L1.thing[L1.i(shaft.x, shaft.y)];
  if (at === NO_THING || !goesDown(game, game.things.get(at)!.def)) {
    if (at !== NO_THING) game.removeThing(at);
    game.spawnThing("stairs_down", 1, shaft.x, shaft.y);
  }
  digDown(game, 2, shaft.x, shaft.y);
  // Layer 2: from the shaft east to the door.
  carve(game, 2, shaft.x, shaft.y, door.x - 1, door.y, "rough_floor");
  game.pathVersion++;
}
