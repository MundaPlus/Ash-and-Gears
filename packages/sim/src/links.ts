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
const DEEP = -2;

export function ensureLinks(game: Game): void {
  repairStairs(game);
  if (game.map.layerAt(-2) >= 0 && !bunkerReachable(game)) connectBunker(game);
}

/** Put back missing halves of stairs: every stairs has a partner going the other way one level up or down. */
export function repairStairs(game: Game): void {
  const air = game.reg.terrain.has("open_air") ? game.reg.terrain.idx("open_air") : -1;
  for (const t of [...game.things.values()]) {
    const s = game.reg.things.list[t.def].stairs ?? 0;
    if (!s) continue;
    const to = game.map.linked(t.layer, s);
    if (to < 0) continue;
    const L = game.map.layers[to];
    const i = L.i(t.x, t.y);
    const b = L.thing[i];
    // A partner going the other way is fine.
    if (b !== NO_THING && Math.sign(game.reg.things.list[game.things.get(b)!.def].stairs ?? 0) === -Math.sign(s)) continue;
    // Going down into rock: dig the way (as dug stairs do).
    if (s > 0 && L.underground) {
      digDown(game, to, t.x, t.y);
      continue;
    }
    if (b !== NO_THING) game.removeThing(b);
    const td = game.reg.terrain.list[L.terrain[i]];
    if (td.solid || L.terrain[i] === air) game.setTerrain(to, t.x, t.y, L.underground ? "cave_floor" : L.level === 0 ? "dirt" : "ruin_floor");
    // Up from below gets stairs down on the floor above (dug stairs between cave layers), down from above gets stairs up.
    game.spawnThing(s > 0 ? "stairs_up" : L.underground ? "dug_stairs" : "stairs_down", to, t.x, t.y);
  }
}

function surfaceStairs(game: Game) {
  return [...game.things.values()]
    .filter((t) => t.layer === 0 && goesDown(game, t.def))
    .sort((a, b) => Math.abs(a.x - game.home.x) + Math.abs(a.y - game.home.y) - (Math.abs(b.x - game.home.x) + Math.abs(b.y - game.home.y)))[0];
}

/** The bunker's outer door: the westmost bunker door on layer 2. */
function bunkerDoor(game: Game) {
  const deep = game.map.layerAt(DEEP);
  const doors = [...game.things.values()].filter((t) => t.layer === deep && idOf(game, t.def) === "bunker_door");
  return doors.length ? doors.reduce((a, b) => (b.x < a.x ? b : a)) : undefined;
}

function bunkerReachable(game: Game): boolean {
  const s = surfaceStairs(game), door = bunkerDoor(game);
  if (!s || !door) return true;
  return game.path.canReach({ layer: 0, x: s.x, y: s.y }, { layer: door.layer, x: door.x - 1, y: door.y });
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
  const cave = game.map.layerAt(-1), deep = door.layer;
  const walls = [...game.things.values()].filter((t) => t.layer === deep && idOf(game, t.def).startsWith("bunker"));
  const minY = Math.min(...walls.map((t) => t.y)), maxY = Math.max(...walls.map((t) => t.y));
  // West of the door; on small maps the bunker may sit near the edge, so keep the shaft on the map.
  const shaft = { x: Math.max(1, door.x - 4), y: door.y };
  // Layer 1: from below the surface stairs to the shaft (around the bunker's rows, which lie below).
  const row = s.y < (minY + maxY) / 2 ? Math.min(s.y, minY - 2) : Math.max(s.y, maxY + 2);
  carve(game, cave, s.x, s.y, s.x, row, "cave_floor");
  carve(game, cave, s.x, row, shaft.x, row, "cave_floor");
  carve(game, cave, shaft.x, row, shaft.x, shaft.y, "cave_floor");
  const L1 = game.map.layers[cave];
  const at = L1.thing[L1.i(shaft.x, shaft.y)];
  if (at === NO_THING || !goesDown(game, game.things.get(at)!.def)) {
    if (at !== NO_THING) game.removeThing(at);
    game.spawnThing("stairs_down", cave, shaft.x, shaft.y);
  }
  digDown(game, deep, shaft.x, shaft.y);
  // The deep layer: from the shaft east to the door.
  carve(game, deep, shaft.x, shaft.y, door.x - 1, door.y, "rough_floor");
  game.pathVersion++;
}
