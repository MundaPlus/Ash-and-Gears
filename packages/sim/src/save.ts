/**
 * Save and load (spec 10 "Saves"). A save is plain JSON: content is referenced by string id
 * (so content order and mods can change), typed arrays are base64. Running jobs and reservations
 * are dropped on load; survivors simply think again. Each format change adds a migration step.
 */
import type { Expedition, WorldMap } from "./world.ts";
import type { Content } from "@wc/data";
import { Game, type GameOptions } from "./game.ts";
import type { Blueprint, ItemStack, Thing, Zone } from "./map.ts";
import type { Pawn } from "./pawn.ts";
import { completeRoofs } from "./rooms.ts";

export const SAVE_VERSION = 2;

type Arr = string; // base64 of a typed array

export interface SaveFile {
  version: number;
  savedAt: string;
  opts: GameOptions;
  tick: number;
  nextId: number;
  rng: number[];
  aiRng: number[];
  /** Content id tables used by the index arrays below. */
  terrainIds: string[];
  floorIds: string[];
  layers: { terrain: Arr; floor: Arr; zone: Arr; desig: Arr; roof?: Arr }[];
  things: (Omit<Thing, "def"> & { def: string })[];
  items: (Omit<ItemStack, "def"> & { def: string })[];
  pawns: SavedPawn[];
  blueprints: (Omit<Blueprint, "def" | "need"> & { def: string; need: Record<string, number> })[];
  zones: Zone[];
  desigTiles: number[];
  home: Game["home"];
  progress: [string, number][];
  billTargets: [string, number][];
  research: { done: string[]; current: string | null; progress: [string, number][] };
  weather: Game["weather"];
  weatherTempOffset: number;
  openWaterContamUntil: number;
  soilContamUntil: number;
  story: Game["story"];
  groups: [number, Game["groups"] extends Map<number, infer V> ? V : never][];
  fires: [number, number][];
  rooms: { cells: number[]; temp: number }[];
  deaths: Game["deaths"];
  goals: Record<string, boolean>;
  opinions?: [string, number][];
  world?: WorldMap | null;
  expeditions?: (Omit<Expedition, "pawns"> & { pawns: SavedPawn[] })[];
  bonds?: [string, string][];
}

export type SavedPawn = Omit<Pawn, "skills" | "traits" | "backstory" | "memories" | "situational" | "creature" | "weapon" | "job" | "path" | "goal" | "carrying"> & {
  skills: Record<string, { level: number; xp: number; passion: number }>;
  traits: string[];
  backstory?: [string, string];
  memories: { thought: string; expires: number }[];
  creature: string;
  weapon: string | null;
  carrying: { def: string; count: number; contaminated?: boolean } | null;
};

// ---------------------------------------------------------------- base64 for typed arrays

function toB64(a: ArrayBufferView): string {
  const bytes = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function intoTyped(target: Uint8Array | Int32Array, b64: string) {
  const bytes = fromB64(b64);
  new Uint8Array(target.buffer, target.byteOffset, target.byteLength).set(bytes.subarray(0, target.byteLength));
}

// ---------------------------------------------------------------- save

export function saveGame(game: Game): SaveFile {
  const reg = game.reg;
  /** Item index keys -> item id keys. */
  const itemMapOut = (r: Record<number, number>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [reg.items.list[Number(k)].id, v]));
  return {
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    opts: { ...game.opts },
    tick: game.tick,
    nextId: game.peekNextId(),
    rng: [...game.rng.s],
    aiRng: [...game.aiRng.s],
    terrainIds: reg.terrain.list.map((t) => t.id),
    floorIds: reg.floors.list.map((f) => f.id),
    layers: game.map.layers.map((L) => ({ terrain: toB64(L.terrain), floor: toB64(L.floor), zone: toB64(L.zone), desig: toB64(L.desig), roof: toB64(L.roof) })),
    things: [...game.things.values()].map((t) => ({ ...t, def: reg.things.list[t.def].id, ...(t.buffer ? { buffer: itemMapOut(t.buffer) } : {}), ...(t.out ? { out: itemMapOut(t.out) } : {}), ...(t.filter !== undefined ? { filter: reg.items.list[t.filter].id as unknown as number } : {}), ...(t.cargo ? { cargo: { ...t.cargo, def: reg.items.list[t.cargo.def].id as unknown as number } } : {}) })),
    items: [...game.items.values()].map((s) => ({ ...s, def: reg.items.list[s.def].id })),
    pawns: [...game.pawns.values()].map((p) => pawnOut(game, p)),
    blueprints: [...game.blueprints.values()].map((b) => ({
      ...b,
      def: b.kind === "thing" ? reg.things.list[b.def].id : reg.floors.list[b.def].id,
      need: Object.fromEntries(Object.entries(b.need).map(([k, v]) => [reg.items.list[Number(k)].id, v])),
    })),
    zones: [...game.zones.values()].map((z) => ({ ...z, allow: [...z.allow] })),
    desigTiles: [...game.desigTiles],
    home: { ...game.home },
    progress: [...game.progress],
    billTargets: [...game.billTargets],
    research: { done: [...game.research.done], current: game.research.current, progress: [...game.research.progress] },
    weather: { ...game.weather, next: game.weather.next ? { ...game.weather.next } : null },
    weatherTempOffset: game.weatherTempOffset,
    openWaterContamUntil: game.openWaterContamUntil,
    soilContamUntil: game.soilContamUntil,
    story: { ...game.story, log: [...game.story.log] },
    groups: [...game.groups].map(([k, v]) => [k, { ...v }]),
    fires: [...game.fires],
    // Room temperatures: one sample cell per room is enough to give them back after the rooms rebuild.
    rooms: [...game.rooms.values()].map((r) => {
      const L = game.map.layers[r.layer];
      const i = L.room.indexOf(r.id);
      return { cells: [r.layer, i], temp: r.temp };
    }),
    deaths: [...game.deaths],
    goals: { ...game.goals },
    opinions: [...game.opinions],
    world: game.world,
    expeditions: game.expeditions.map((e) => ({ ...e, pawns: e.pawns.map((p) => pawnOut(game, p)) })),
    bonds: [...game.bonds],
  };
}

// ---------------------------------------------------------------- load

/** Upgrade old saves step by step. */
export function migrate(data: SaveFile): SaveFile {
  if (data.version > SAVE_VERSION) throw new Error(`save is from a newer version (${data.version})`);
  // Version 1 had automatic roofs and did not store them. loadGame builds them all.
  if (data.version === 1) data.version = 2;
  return data;
}

export function loadGame(content: Content, raw: SaveFile): Game {
  const data = migrate(raw);
  const game = new Game(content, data.opts);
  const reg = game.reg;
  const itemMapIn = (r: Record<string, number>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [reg.items.idx(k), v]));
  const idOr = (table: { has(id: string): boolean; idx(id: string): number }, id: string, what: string) => {
    if (!table.has(id)) throw new Error(`save uses unknown ${what}: ${id}`);
    return table.idx(id);
  };
  game.tick = data.tick;
  game.setNextId(data.nextId);
  game.rng.s = [...data.rng] as [number, number, number, number];
  game.aiRng.s = [...data.aiRng] as [number, number, number, number];

  // Map arrays, remapping content indices through the saved id tables.
  const terrainMap = data.terrainIds.map((id) => idOr(reg.terrain, id, "terrain"));
  const floorMap = data.floorIds.map((id) => (reg.floors.has(id) ? reg.floors.idx(id) + 1 : 0));
  data.layers.forEach((l, i) => {
    const L = game.map.layers[i];
    intoTyped(L.terrain, l.terrain);
    for (let k = 0; k < L.terrain.length; k++) L.terrain[k] = terrainMap[L.terrain[k]];
    intoTyped(L.floor, l.floor);
    for (let k = 0; k < L.floor.length; k++) if (L.floor[k]) L.floor[k] = floorMap[L.floor[k] - 1];
    intoTyped(L.zone, l.zone);
    intoTyped(L.desig, l.desig);
    if (l.roof) intoTyped(L.roof, l.roof);
  });

  for (const t of data.things) {
    const thing: Thing = { ...(t as unknown as Thing), def: idOr(reg.things, t.def, "thing") };
    if (t.buffer) thing.buffer = itemMapIn(t.buffer);
    if (t.out) thing.out = itemMapIn(t.out);
    if (t.filter !== undefined) thing.filter = reg.items.idx(t.filter as unknown as string);
    if (t.cargo) thing.cargo = { ...t.cargo, def: reg.items.idx(t.cargo.def as unknown as string) };
    game.things.set(thing.id, thing);
    const L = game.map.layers[thing.layer];
    for (const f of game.footprint(thing.def, thing.x, thing.y, thing.rot)) L.thing[L.i(f.x, f.y)] = thing.id;
  }
  for (const s of data.items) {
    const st: ItemStack = { ...s, def: idOr(reg.items, s.def, "item") };
    game.items.set(st.id, st);
    if (st.layer >= 0) {
      const L = game.map.layers[st.layer];
      L.item[L.i(st.x, st.y)] = st.id;
    }
  }
  for (const sp of data.pawns) {
    const p = pawnIn(game, sp);
    game.pawns.set(p.id, p);
    // Whatever was carried lands at the pawn's feet.
    if (sp.carrying && reg.items.has(sp.carrying.def)) {
      const def = reg.items.idx(sp.carrying.def);
      const L = game.map.layers[p.layer];
      const id = game.newId();
      const st: ItemStack = { id, def, count: sp.carrying.count, layer: p.layer, x: p.x, y: p.y };
      if (L.item[L.i(p.x, p.y)] === -1) {
        game.items.set(id, st);
        L.item[L.i(p.x, p.y)] = id;
      }
    }
  }
  for (const b of data.blueprints) {
    const bp: Blueprint = {
      ...b,
      def: b.kind === "thing" ? idOr(reg.things, b.def, "thing") : idOr(reg.floors, b.def, "floor"),
      need: Object.fromEntries(Object.entries(b.need).map(([k, v]) => [reg.items.idx(k), v])),
    };
    game.blueprints.set(bp.id, bp);
    const L = game.map.layers[bp.layer];
    L.blueprint[L.i(bp.x, bp.y)] = bp.id;
  }
  for (const z of data.zones) game.zones.set(z.id, { ...z });
  for (const n of data.desigTiles) game.desigTiles.add(n);
  game.home = { ...data.home };
  for (const [k, v] of data.progress) game.progress.set(k, v);
  for (const [k, v] of data.billTargets) game.billTargets.set(k, v);
  for (const r of data.research.done) game.research.done.add(r);
  game.research.current = data.research.current;
  for (const [k, v] of data.research.progress) game.research.progress.set(k, v);
  game.weather = { ...data.weather };
  game.weatherTempOffset = data.weatherTempOffset;
  game.openWaterContamUntil = data.openWaterContamUntil;
  game.soilContamUntil = data.soilContamUntil;
  Object.assign(game.story, data.story);
  for (const [k, v] of data.groups) game.groups.set(k, { ...v });
  for (const [k, v] of data.fires) game.fires.set(k, v);
  game.deaths.push(...data.deaths);
  game.goals = { ...(data.goals ?? {}) };
  for (const [k, v] of data.opinions ?? []) game.opinions.set(k, v);
  game.world = data.world ?? null;
  game.expeditions = (data.expeditions ?? []).map((e) => ({ ...e, pawns: e.pawns.map((sp) => pawnIn(game, sp)) }));
  for (const [k, v] of data.bonds ?? []) game.bonds.set(k, v as "family" | "lover");
  game.story.raidsSurvived ??= 0;

  // Rebuild derived state, then give rooms their saved temperatures.
  game.pathVersion++;
  game.wallVersion++;
  for (const L of game.map.layers) game.wallDirty.add(L.index);
  game.powerVersion++;
  game.mapVersion++;
  game.rebuildDerived();
  if (!data.layers[0].roof) completeRoofs(game);
  for (const r of data.rooms) {
    const [layer, i] = r.cells;
    if (i < 0) continue;
    const room = game.rooms.get(game.map.layers[layer].room[i]);
    if (room && !room.outdoor) room.temp = r.temp;
  }
  for (const L of game.map.layers) L.chunkVersion.fill(1);
  return game;
}

/** Compress a save to bytes (gzip) where the platform supports it. */
export async function packSave(data: SaveFile): Promise<Uint8Array> {
  const json = new TextEncoder().encode(JSON.stringify(data));
  if (typeof CompressionStream === "undefined") return json;
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function unpackSave(bytes: Uint8Array): Promise<SaveFile> {
  // gzip magic number 1f 8b
  if (bytes[0] === 0x1f && bytes[1] === 0x8b && typeof DecompressionStream !== "undefined") {
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"));
    return JSON.parse(await new Response(stream).text());
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** A pawn as saved data (ids instead of indexes; no job or path). Also used for pawns on expeditions. */
export function pawnOut(game: Game, p: Pawn): SavedPawn {
  const reg = game.reg;
  return {
    ...p,
    job: undefined,
    path: undefined,
    goal: undefined,
    situational: undefined,
    skills: Object.fromEntries(reg.skills.list.map((s, i) => [s.id, { ...p.skills[i] }])),
    traits: p.traits.map((t) => reg.traits.list[t].id),
    backstory: p.backstory ? [reg.backstories.list[p.backstory[0]].id, reg.backstories.list[p.backstory[1]].id] : undefined,
    memories: p.memories.map((m) => ({ thought: reg.thoughts.list[m.thought].id, expires: m.expires })),
    creature: reg.content.creatures[p.creature].id,
    weapon: p.weapon !== null ? reg.items.list[p.weapon].id : null,
    carrying: p.carrying ? { def: reg.items.list[p.carrying.def].id, count: p.carrying.count, ...(p.carrying.contaminated ? { contaminated: true } : {}) } : null,
  } as unknown as SavedPawn;
}

/** A saved pawn back into a live one (what it carried is not restored here). */
export function pawnIn(game: Game, sp: SavedPawn): Pawn {
  const reg = game.reg;
  return {
    ...(sp as unknown as Pawn),
    skills: reg.skills.list.map((s) => (sp.skills[s.id] ? { ...sp.skills[s.id] } : { level: 0, xp: 0, passion: 0 }) as Pawn["skills"][number]),
    traits: sp.traits.filter((t) => reg.traits.has(t)).map((t) => reg.traits.idx(t)),
    backstory: sp.backstory && sp.backstory.every((b) => reg.backstories.has(b)) ? [reg.backstories.idx(sp.backstory[0]), reg.backstories.idx(sp.backstory[1])] : undefined,
    memories: sp.memories.filter((m) => reg.thoughts.has(m.thought)).map((m) => ({ thought: reg.thoughts.idx(m.thought), expires: m.expires })),
    situational: [],
    creature: Math.max(0, reg.content.creatures.findIndex((c) => c.id === sp.creature)),
    weapon: sp.weapon && reg.items.has(sp.weapon) ? reg.items.idx(sp.weapon) : null,
    carrying: null,
    job: null,
    path: null,
    goal: null,
    asleep: false,
    thinkCooldown: 0,
  } as Pawn;
}
