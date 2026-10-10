/**
 * Home map generator. Surface: a ruined town on dry land. Layer 1: rock with caves and seams.
 * Layer 2 (A4): deeper rock with fewer caves and an old bunker of sealed rooms with lockers.
 * All randomness comes from the game seed, so one seed always makes the same map.
 */
import type { Game } from "./game.ts";
import type { Layer } from "./map.ts";
import { NO_THING } from "./map.ts";
import { Noise2D } from "./noise.ts";
import { fillAir, generateTowers, sealBunker } from "./towers.ts";
import type { Rng } from "./rng.ts";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function generateHomeMap(game: Game): void {
  const rng = game.rng.fork("mapgen");
  generateSurface(game, rng.fork("surface"));
  for (const L of game.map.layers) if (L.underground) generateUnderground(game, L.index, rng.fork(`under${L.index}`));
  const deep = game.map.layerAt(-2);
  if (deep >= 0) placeBunker(game, deep, rng.fork("bunker"));
  placeStairs(game, rng.fork("stairs"));
  // Tower floors (N1): air everywhere, then the towers; and sealed lairs in the bunker.
  fillAir(game);
  generateTowers(game, rng.fork("towers"));
  sealBunker(game, rng.fork("lairs"));
}

function setT(game: Game, layer: Layer, x: number, y: number, terrain: string) {
  layer.terrain[layer.i(x, y)] = game.reg.terrain.idx(terrain);
  game.pathVersion++;
}

function terrainId(game: Game, layer: Layer, x: number, y: number): string {
  return game.reg.terrain.list[layer.terrain[layer.i(x, y)]].id;
}

function generateSurface(game: Game, rng: Rng) {
  const layer = game.map.layers[0];
  const { w, h } = layer;
  const base = new Noise2D(rng.fork("base"));
  const soil = new Noise2D(rng.fork("soil"));
  const rock = new Noise2D(rng.fork("rock"));
  const water = new Noise2D(rng.fork("water"));
  const cx = w >> 1, cy = h >> 1;

  // 1. Ground, rock outcrops and sludge.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = base.fbm(x, y, 40);
      let t = n < 0.32 ? "sand" : n < 0.64 ? "dirt" : "ash";
      if (t === "dirt" && soil.fbm(x, y, 18) > 0.66) t = "rich_soil";
      const centerDist = Math.hypot(x - cx, y - cy);
      if (rock.fbm(x, y, 30, 5) > 0.69 && centerDist > 18) t = "rock";
      else if (water.fbm(x, y, 22) < 0.24 && centerDist > 12) t = "sludge";
      setT(game, layer, x, y, t);
    }
  }

  // 2. Toxic pools: a few small blobs away from the start.
  const pools = rng.int(2, 4);
  for (let p = 0; p < pools; p++) {
    const px = rng.int(8, w - 9), py = rng.int(8, h - 9);
    if (Math.hypot(px - cx, py - cy) < 30) continue;
    const r = rng.int(2, 4);
    for (let y = -r; y <= r; y++)
      for (let x = -r; x <= r; x++)
        if (x * x + y * y <= r * r + rng.int(-1, 1) && layer.inBounds(px + x, py + y))
          setT(game, layer, px + x, py + y, "toxic_pool");
  }

  // 3. Roads: an old town grid.
  const roads: Rect[] = [];
  const roadW = 4;
  const hLines = pickLines(rng, h, rng.int(2, 3));
  const vLines = pickLines(rng, w, rng.int(2, 3));
  for (const y0 of hLines) roads.push({ x: 0, y: y0, w, h: roadW });
  for (const x0 of vLines) roads.push({ x: x0, y: 0, w: roadW, h });
  for (const r of roads) {
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++) {
        if (!layer.inBounds(x, y)) continue;
        const roll = rng.next();
        setT(game, layer, x, y, roll < 0.08 ? "dirt" : roll < 0.11 ? "rubble" : "asphalt");
        // Roads cross, so a tile may already hold a wreck from the other road.
        if (rng.chance(0.012) && layer.thing[layer.i(x, y)] === NO_THING) game.spawnThing("car_wreck", 0, x, y, (x * 7 + y * 13) % 4); // wrecks face all ways (from the position: no extra random numbers, so maps stay the same)
      }
  }

  // 4. Ruined buildings in the blocks between roads.
  const xs = [0, ...vLines.map((v) => v + roadW), w].sort((a, b) => a - b);
  const vStarts = [...vLines, w].sort((a, b) => a - b);
  const ys = [0, ...hLines.map((v) => v + roadW), h].sort((a, b) => a - b);
  const hStarts = [...hLines, h].sort((a, b) => a - b);
  const ruins: Rect[] = [];
  for (let bi = 0; bi < xs.length - 1; bi++) {
    for (let bj = 0; bj < ys.length - 1; bj++) {
      const block: Rect = { x: xs[bi], y: ys[bj], w: vStarts[bi] - xs[bi], h: hStarts[bj] - ys[bj] };
      placeRuinsInBlock(game, layer, rng, block, cx, cy, ruins);
    }
  }
  placeSafe(game, layer, rng, ruins, cx, cy);

  // 5. Plants and scrap piles on open ground.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (layer.thing[layer.i(x, y)] !== NO_THING) continue;
      const t = terrainId(game, layer, x, y);
      if ((t === "dirt" || t === "ash") && rng.chance(0.018)) game.spawnThing("dead_tree", 0, x, y);
      else if ((t === "dirt" || t === "rich_soil") && rng.chance(0.03)) game.spawnThing("mutant_shrub", 0, x, y);
      else if (t !== "rock" && t !== "sludge" && t !== "toxic_pool" && rng.chance(0.004))
        game.spawnThing("scrap_pile", 0, x, y);
    }
  }

  // 6. Clear the start area so survivors can always move and build.
  for (let y = cy - 7; y <= cy + 7; y++)
    for (let x = cx - 7; x <= cx + 7; x++) {
      const t = terrainId(game, layer, x, y);
      if (t === "rock" || t === "sludge" || t === "toxic_pool" || t === "rubble") setT(game, layer, x, y, "dirt");
      const th = layer.thing[layer.i(x, y)];
      if (th !== NO_THING && game.reg.things.list[game.things.get(th)!.def].blocks) game.removeThing(th);
    }
}

/** One old safe with the factory manual (blueprint for auto-crafting), in a ruin a fair walk from home. */
function placeSafe(game: Game, layer: Layer, rng: Rng, ruins: Rect[], cx: number, cy: number) {
  const far = ruins
    .map((r) => ({ r, d: Math.hypot(r.x + r.w / 2 - cx, r.y + r.h / 2 - cy) }))
    .filter((o) => o.d > 20)
    .sort((a, b) => a.d - b.d);
  const pick = far.length ? far[Math.min(far.length - 1, rng.int(0, 2))].r : ruins[0];
  if (!pick) return;
  for (let tries = 0; tries < 40; tries++) {
    const x = pick.x + rng.int(1, pick.w - 2), y = pick.y + rng.int(1, pick.h - 2);
    if (layer.thing[layer.i(x, y)] === NO_THING && game.walkable(0, x, y)) {
      game.spawnThing("old_safe", 0, x, y);
      return;
    }
  }
}

/** Pick `n` road positions spread across `size`, away from the edges and from each other. */
function pickLines(rng: Rng, size: number, n: number): number[] {
  const out: number[] = [];
  const seg = size / (n + 1);
  for (let i = 1; i <= n; i++) out.push(Math.floor(seg * i + rng.int(-seg / 5, seg / 5)));
  return out;
}

function placeRuinsInBlock(game: Game, layer: Layer, rng: Rng, block: Rect, cx: number, cy: number, ruins: Rect[]) {
  const margin = 2;
  let tries = Math.floor((block.w * block.h) / 180);
  while (tries-- > 0) {
    const bw = rng.int(6, 14), bh = rng.int(5, 11);
    if (block.w - 2 * margin < bw || block.h - 2 * margin < bh) continue;
    const r: Rect = {
      x: block.x + margin + rng.int(0, block.w - 2 * margin - bw),
      y: block.y + margin + rng.int(0, block.h - 2 * margin - bh),
      w: bw,
      h: bh,
    };
    // Keep the start area free and do not overlap rock, water or other ruins.
    if (overlaps(r, { x: cx - 9, y: cy - 9, w: 19, h: 19 })) continue;
    if (!areaIs(game, layer, r, ["dirt", "rich_soil", "sand", "ash"])) continue;
    if (!areaFree(layer, { x: r.x - 1, y: r.y - 1, w: r.w + 2, h: r.h + 2 })) continue;
    buildRuin(game, layer, rng, r);
    ruins.push(r);
  }
}

function buildRuin(game: Game, layer: Layer, rng: Rng, r: Rect) {
  const collapsed = rng.chance(0.2);
  const keep = collapsed ? 0.35 : 0.78;
  // Door gaps: one or two per building.
  const doors = new Set<string>();
  for (let d = rng.int(1, 2); d > 0; d--) {
    if (rng.chance(0.5)) doors.add(`${r.x + rng.int(1, r.w - 2)},${rng.chance(0.5) ? r.y : r.y + r.h - 1}`);
    else doors.add(`${rng.chance(0.5) ? r.x : r.x + r.w - 1},${r.y + rng.int(1, r.h - 2)}`);
  }
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      const edge = x === r.x || y === r.y || x === r.x + r.w - 1 || y === r.y + r.h - 1;
      setT(game, layer, x, y, collapsed && rng.chance(0.5) ? "rubble" : "ruin_floor");
      if (edge) {
        if (!doors.has(`${x},${y}`) && rng.chance(keep)) game.spawnThing("ruin_wall", 0, x, y);
        else if (rng.chance(0.4)) setT(game, layer, x, y, "rubble");
      } else if (rng.chance(collapsed ? 0.25 : 0.07)) setT(game, layer, x, y, "rubble");
      else if (rng.chance(0.03)) game.spawnThing("scrap_pile", 0, x, y);
    }
  }
  if (rng.chance(0.6)) {
    const x = r.x + rng.int(1, r.w - 2), y = r.y + rng.int(1, r.h - 2);
    if (layer.thing[layer.i(x, y)] === NO_THING) game.spawnThing("loot_crate", 0, x, y);
  }
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function areaIs(game: Game, layer: Layer, r: Rect, allowed: string[]): boolean {
  for (let y = r.y; y < r.y + r.h; y++)
    for (let x = r.x; x < r.x + r.w; x++) if (!allowed.includes(terrainId(game, layer, x, y))) return false;
  return true;
}

function areaFree(layer: Layer, r: Rect): boolean {
  for (let y = r.y; y < r.y + r.h; y++)
    for (let x = r.x; x < r.x + r.w; x++)
      if (layer.inBounds(x, y) && layer.thing[layer.i(x, y)] !== NO_THING) return false;
  return true;
}

function generateUnderground(game: Game, l: number, rng: Rng) {
  const layer = game.map.layers[l];
  // Deeper layers have fewer caves and richer seams.
  const caveAt = l >= 2 ? 0.68 : 0.6;
  const coalAt = l >= 2 ? 0.66 : 0.7;
  const junkAt = l >= 2 ? 0.7 : 0.74;
  const cave = new Noise2D(rng.fork("cave"));
  const coal = new Noise2D(rng.fork("coal"));
  const junk = new Noise2D(rng.fork("junk"));
  const wet = new Noise2D(rng.fork("wet"));
  for (let y = 0; y < layer.h; y++) {
    for (let x = 0; x < layer.w; x++) {
      let t = "rock";
      if (cave.fbm(x, y, 26, 5) > caveAt) t = wet.fbm(x, y, 14) < 0.22 ? "sludge" : "cave_floor";
      else if (coal.fbm(x, y, 12) > coalAt) t = "coal_seam";
      else if (junk.fbm(x, y, 10) > junkAt) t = "scrap_vein";
      setT(game, layer, x, y, t);
    }
  }
}

/** Put a stairway next to a rock outcrop near the start and carve a small cave under it. */
function placeStairs(game: Game, rng: Rng) {
  if (game.map.layerAt(-1) < 0) return;
  const top = game.map.layers[0], lowIdx = game.map.layerAt(-1), low = game.map.layers[lowIdx];
  const cx = top.w >> 1, cy = top.h >> 1;
  const rockIdx = game.reg.terrain.idx("rock");
  let best: [number, number] | null = null;
  let bestD = Infinity;
  for (let y = 2; y < top.h - 2; y++) {
    for (let x = 2; x < top.w - 2; x++) {
      const i = top.i(x, y);
      if (top.terrain[i] === rockIdx || top.thing[i] !== NO_THING) continue;
      if (game.reg.terrain.list[top.terrain[i]].walkCost === 0) continue;
      const nearRock =
        top.terrain[top.i(x + 1, y)] === rockIdx || top.terrain[top.i(x - 1, y)] === rockIdx ||
        top.terrain[top.i(x, y + 1)] === rockIdx || top.terrain[top.i(x, y - 1)] === rockIdx;
      if (!nearRock) continue;
      const d = Math.hypot(x - cx, y - cy) + rng.next() * 6;
      if (d > 14 && d < bestD) {
        bestD = d;
        best = [x, y];
      }
    }
  }
  // Fallback: no rock found. Use a spot east of the start.
  const [sx, sy] = best ?? [cx + 10, cy];
  game.spawnThing("stairs_down", 0, sx, sy);
  for (let y = -3; y <= 3; y++)
    for (let x = -3; x <= 3; x++)
      if (x * x + y * y <= 10 && low.inBounds(sx + x, sy + y)) setT(game, low, sx + x, sy + y, "cave_floor");
  game.spawnThing("stairs_up", lowIdx, sx, sy);
}

/**
 * The old bunker: 3 x 2 rooms (6 x 5 inside) with bunker walls, doors between rooms and one door
 * out on the west side, two lockers per room. It sits 15-30 tiles from the map center.
 */
function placeBunker(game: Game, l: number, rng: Rng) {
  const layer = game.map.layers[l];
  const RW = 7, RH = 6, COLS = 3, ROWS = 2;
  const w = COLS * RW + 1, h = ROWS * RH + 1;
  const ang = rng.next() * Math.PI * 2, dist = 15 + rng.next() * 15;
  const x0 = Math.max(2, Math.min(layer.w - w - 2, Math.round((layer.w >> 1) + Math.cos(ang) * dist - w / 2)));
  const y0 = Math.max(2, Math.min(layer.h - h - 2, Math.round((layer.h >> 1) + Math.sin(ang) * dist - h / 2)));
  for (let y = y0; y < y0 + h; y++)
    for (let x = x0; x < x0 + w; x++) {
      setT(game, layer, x, y, "bunker_floor");
      const th = layer.thing[layer.i(x, y)];
      if (th !== NO_THING) game.removeThing(th);
    }
  const door = (x: number, y: number) => {
    const th = layer.thing[layer.i(x, y)];
    if (th !== NO_THING) game.removeThing(th);
    game.spawnThing("bunker_door", l, x, y);
  };
  for (let y = y0; y < y0 + h; y++)
    for (let x = x0; x < x0 + w; x++) if ((x - x0) % RW === 0 || (y - y0) % RH === 0) game.spawnThing("bunker_wall", l, x, y);
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const rx = x0 + c * RW, ry = y0 + r * RH;
      // Doors east and south to the next room.
      if (c < COLS - 1) door(rx + RW, ry + 3);
      if (r < ROWS - 1) door(rx + 3, ry + RH);
      for (let k = 0; k < 2; k++) {
        const lx = rx + 1 + rng.int(0, RW - 3), ly = ry + 1 + rng.int(0, RH - 3);
        if (layer.thing[layer.i(lx, ly)] === NO_THING) game.spawnThing("bunker_locker", l, lx, ly);
      }
    }
  door(x0, y0 + 3);
}
