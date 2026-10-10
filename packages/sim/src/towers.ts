/**
 * Ruined towers (N1): buildings with floors above the surface. Each tower is 12 x 10 tiles and 2 or 3
 * stories high. Stairs lead up floor by floor; the top floor holds a sealed room with a lair and
 * better loot. Tower floors are open air outside the towers. The old bunker gets sealed lairs too.
 * New games get towers at map generation; older saves get them on free ground when they load.
 */
import type { Game } from "./game.ts";
import { makeLair, LAIR_KINDS, type LairKind, type LairRect } from "./lairs.ts";
import { NO_THING } from "./map.ts";
import { dropItems } from "./items.ts";
import type { Rng } from "./rng.ts";

const TW = 12, TH = 10;
/** Lair rooms made by map generation, filled once the start colony exists (so colonists come first). */
const pending = new WeakMap<Game, { room: LairRect; kind: LairKind; rng: Rng }[]>();

function planLair(game: Game, room: LairRect, rng: Rng) {
  const list = pending.get(game) ?? [];
  list.push({ room, kind: LAIR_KINDS[rng.int(0, LAIR_KINDS.length - 1)], rng: rng.fork(`lair${list.length}`) });
  pending.set(game, list);
}

/** Spawn the enemies of every planned lair (after the start colony; old saves: right after the towers). */
export function populateLairs(game: Game): void {
  for (const l of pending.get(game) ?? []) makeLair(game, l.room, l.kind, l.rng);
  pending.delete(game);
}
/** Rewards in a sealed room, one of each list. */
const LAIR_GEAR = ["hunting_rifle", "nail_gun", "scrap_shotgun", "scrap_vest", "plate_helmet", "plate_vest"];
const LAIR_GOODS: [string, number, number][] = [["components", 3, 6], ["steel", 4, 10], ["medkit", 1, 2]];

/** Fill the tower floors (levels above the surface) with open air. */
export function fillAir(game: Game): void {
  const air = game.reg.terrain.idx("open_air");
  for (const L of game.map.layers) if (L.level > 0) L.terrain.fill(air);
  game.pathVersion++;
}

/** Can a tower stand here (with a one-tile margin)? Old saves (`late`) also keep every item where it lies. */
function siteFree(game: Game, x0: number, y0: number, late: boolean): boolean {
  const L = game.map.layers[0];
  for (let y = y0 - 1; y <= y0 + TH; y++)
    for (let x = x0 - 1; x <= x0 + TW; x++) {
      if (!L.inBounds(x, y) || x < 3 || y < 3 || x > L.w - 4 || y > L.h - 4) return false;
      const i = L.i(x, y);
      const td = game.reg.terrain.list[L.terrain[i]];
      if (td.solid || td.water || td.walkCost === 0) return false;
      if (L.zone[i] !== NO_THING || L.floor[i] || L.blueprint[i] !== NO_THING || L.desig[i]) return false;
      // Old ruins and plants make way; nothing the colony built, and never stairs.
      const th = L.thing[i];
      if (th !== NO_THING) {
        const d = game.reg.things.list[game.things.get(th)!.def];
        if (d.build || d.kind === "stairs" || d.bench || d.bed) return false;
      }
      if (late && L.item[i] !== NO_THING) return false;
    }
  for (const p of game.pawns.values()) if (p.layer === 0 && p.x >= x0 - 1 && p.x <= x0 + TW && p.y >= y0 - 1 && p.y <= y0 + TH) return false;
  return true;
}

/** Place 1-2 towers a fair walk from the map center. `late`: an old save (keep away from everything). */
export function generateTowers(game: Game, rng: Rng, late = false): void {
  const top = game.map.layerAt(1);
  if (top < 0 || !game.reg.terrain.has("open_air")) return;
  const L = game.map.layers[0];
  const cx = L.w >> 1, cy = L.h >> 1;
  const want = L.w >= 150 ? 2 : 1;
  const placed: { x: number; y: number }[] = [];
  for (let tries = 0; tries < 400 && placed.length < want; tries++) {
    const ang = rng.next() * Math.PI * 2, d = 22 + rng.next() * Math.min(45, L.w / 2 - 20);
    const x0 = Math.round(cx + Math.cos(ang) * d - TW / 2), y0 = Math.round(cy + Math.sin(ang) * d - TH / 2);
    if (placed.some((p) => Math.abs(p.x - x0) < TW + 8 && Math.abs(p.y - y0) < TH + 8)) continue;
    if (!siteFree(game, x0, y0, late)) continue;
    buildTower(game, x0, y0, rng);
    placed.push({ x: x0, y: y0 });
  }
}

function buildTower(game: Game, x0: number, y0: number, rng: Rng) {
  let floors = 1;
  while (game.map.layerAt(floors) >= 0) floors++;
  const stories = Math.min(floors, rng.int(2, 3));
  const x1 = x0 + TW - 1, y1 = y0 + TH - 1;
  const corners = [
    { x: x0 + 2, y: y0 + 2 },
    { x: x1 - 2, y: y1 - 2 },
  ];
  for (let k = 0; k < stories; k++) {
    const l = game.map.layerAt(k);
    const L = game.map.layers[l];
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const th = L.thing[L.i(x, y)];
        if (th !== NO_THING) game.removeThing(th);
        game.setTerrain(l, x, y, "ruin_floor");
        const edge = x === x0 || x === x1 || y === y0 || y === y1;
        // The ground floor has two doorways: south and west.
        const doorway = k === 0 && ((y === y1 && (x === x0 + 5 || x === x0 + 6)) || (x === x0 && y === y0 + 4));
        if (edge && !doorway) game.spawnThing("ruin_wall", l, x, y);
      }
    // Stairs: up from the ground at one corner; each floor goes down there and up at the other corner.
    if (k > 0) game.spawnThing("stairs_down", l, corners[(k - 1) % 2].x, corners[(k - 1) % 2].y);
    if (k < stories - 1) game.spawnThing("stairs_up", l, corners[k % 2].x, corners[k % 2].y);
    if (k === stories - 1) sealedRoom(game, l, x0, y0, rng);
    else if (k > 0) {
      // A crate or two of old supplies.
      for (let n = rng.int(1, 2); n > 0; n--) {
        const x = rng.int(x0 + 1, x1 - 1), y = rng.int(y0 + 1, y1 - 1);
        if (L.thing[L.i(x, y)] === NO_THING) game.spawnThing("loot_crate", l, x, y);
      }
    }
  }
}

/** The top floor's sealed room: a wall corner in the north-east, a sealed door, a lair and loot. */
function sealedRoom(game: Game, l: number, x0: number, y0: number, rng: Rng) {
  const L = game.map.layers[l];
  const wx = x0 + TW - 6, wy = y0 + 5;
  for (let y = y0 + 1; y <= wy; y++) if (L.thing[L.i(wx, y)] === NO_THING) game.spawnThing("ruin_wall", l, wx, y);
  for (let x = wx + 1; x < x0 + TW - 1; x++) if (L.thing[L.i(x, wy)] === NO_THING) game.spawnThing("ruin_wall", l, x, wy);
  game.removeThing(L.thing[L.i(wx, y0 + 2)]);
  game.spawnThing("sealed_door", l, wx, y0 + 2);
  const room: LairRect = { layer: l, x0: wx + 1, y0: y0 + 1, x1: x0 + TW - 2, y1: wy - 1 };
  stockRoom(game, room, rng);
  planLair(game, room, rng);
}

/** Loot in a sealed room: a locker or a safe, a gear piece and some goods. */
function stockRoom(game: Game, r: LairRect, rng: Rng) {
  const L = game.map.layers[r.layer];
  if (L.thing[L.i(r.x1, r.y0)] === NO_THING) game.spawnThing(rng.chance(0.3) ? "old_safe" : "bunker_locker", r.layer, r.x1, r.y0);
  const gear = LAIR_GEAR.filter((id) => game.reg.items.has(id));
  if (gear.length) dropItems(game, gear[rng.int(0, gear.length - 1)], 1, r.layer, r.x0, r.y1);
  const [item, lo, hi] = LAIR_GOODS[rng.int(0, LAIR_GOODS.length - 1)];
  if (game.reg.items.has(item)) dropItems(game, item, rng.int(lo, hi), r.layer, r.x1, r.y1);
}

/** Two of the six bunker rooms (the southern corners) are sealed lairs. Needs the bunker from mapgen. */
export function sealBunker(game: Game, rng: Rng): void {
  const l = game.map.layerAt(-2);
  if (l < 0) return;
  const walls = [...game.things.values()].filter((t) => t.layer === l && game.reg.things.list[t.def].id === "bunker_wall");
  if (!walls.length) return;
  const x0 = Math.min(...walls.map((t) => t.x)), y0 = Math.min(...walls.map((t) => t.y));
  const RW = 7, RH = 6;
  const L = game.map.layers[l];
  const seal = (x: number, y: number) => {
    const th = L.thing[L.i(x, y)];
    if (th === NO_THING || game.reg.things.list[game.things.get(th)!.def].id !== "bunker_door") return;
    game.removeThing(th);
    game.spawnThing("sealed_door", l, x, y);
  };
  // Room (0, 1): doors north and east. Room (2, 1): doors north and west.
  seal(x0 + 3, y0 + RH);
  seal(x0 + RW, y0 + RH + 3);
  seal(x0 + 2 * RW + 3, y0 + RH);
  seal(x0 + 2 * RW, y0 + RH + 3);
  for (const c of [0, 2]) {
    const room: LairRect = { layer: l, x0: x0 + c * RW + 1, y0: y0 + RH + 1, x1: x0 + (c + 1) * RW - 1, y1: y0 + 2 * RH - 1 };
    stockRoom(game, room, rng);
    planLair(game, room, rng);
  }
}
