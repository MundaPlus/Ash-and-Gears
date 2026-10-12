/**
 * Tutorial scenario (user request: "a tutorial scenario with guided gameplay, the same every time, a smaller map").
 * The map is built by hand, not by the map generator, so it stays the same when mapgen changes.
 * No storyteller, no rad clouds, no rain, no idle self-orders. One scripted raid near the end.
 * Steps advance by themselves a moment after their check passes. The client reports UI-only actions
 * (camera, pause, select, work grid) with `tutorialFlag`.
 */
import type { Game, GameOptions } from "./game.ts";
import { dropItems } from "./items.ts";
import { Desig } from "./map.ts";
import { addMemory, makeHostile, makeSurvivor } from "./pawn.ts";
import { roomAt } from "./rooms.ts";
import { makeFamily } from "./social.ts";

export const TUTORIAL_SIZE = 64;

/** Options the tutorial always uses, whatever the URL asks for. */
export const TUTORIAL_OPTIONS: Partial<GameOptions> = {
  seed: "tutorial",
  mapSize: TUTORIAL_SIZE,
  layers: 1,
  upper: 0,
  dayLengthSec: 360,
  seasonDays: 15,
  storyteller: "none",
  storyline: null,
  radCloudScale: 0,
  raidScale: 0,
  mutantScale: 0,
  idleWork: false,
};

export const TUTORIAL_STEPS = ["camera", "time", "select", "stockpile", "cut", "room", "bed", "grow", "work", "cook", "research", "draft", "raid", "done"] as const;
export type TutorialStepId = (typeof TUTORIAL_STEPS)[number];

/** Flags the client sets for actions the sim cannot see. */
export type TutorialFlag = "camera" | "pause" | "select" | "work" | "draft";

export interface TutorialState {
  step: number;
  flags: string[];
  /** Tick the current step's check first passed; the next step starts a moment later. */
  passedAt: number | null;
  /** Raids survived when the raid step began. */
  raidBase?: number;
}

/** Ticks between "done" and the next step (2 s at 1x). */
export const TUTORIAL_PAUSE = 40;

export const TUTORIAL_HOME = { x: 32, y: 30 };
/** The raid comes from the east edge, on these tiles. */
const RAID_TILES = [
  { x: 62, y: 29 },
  { x: 62, y: 31 },
];
const NAMES: [string, string, string][] = [
  ["Mara", "Kos", "Rust"],
  ["Jonas", "Vidmar", "Pike"],
  ["Ivy", "Hart", "Sparrow"],
];

export function isTutorial(game: Game): boolean {
  return game.opts.scenario === "tutorial";
}

/** True while the tutorial runs (the free play after the last step does not count). */
export function tutorialActive(game: Game): boolean {
  return !!game.tutorial && TUTORIAL_STEPS[game.tutorial.step] !== "done";
}

function setT(game: Game, x: number, y: number, terrain: string) {
  const L = game.map.layers[0];
  if (L.inBounds(x, y)) L.terrain[L.i(x, y)] = game.reg.terrain.idx(terrain);
}

function put(game: Game, def: string, x: number, y: number) {
  const L = game.map.layers[0];
  if (L.inBounds(x, y) && game.fits(game.reg.things.idx(def), 0, x, y) && game.walkable(0, x, y)) game.spawnThing(def, 0, x, y);
}

/** The hand-built 64 x 64 map: home in the middle, trees to the north-west, rich soil to the west, a ruin to the east. */
export function buildTutorialMap(game: Game): void {
  const n = TUTORIAL_SIZE;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      // A fixed pattern of ash and sand, so the ground is not flat.
      let t = "dirt";
      if (y >= 56) t = "sand";
      else if ((x * 7 + y * 11) % 23 === 0 || (x < 6 && y < 10)) t = "ash";
      setT(game, x, y, t);
    }
  // Rock hills in the north-east.
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) if (Math.hypot(x - 55, y - 8) < 7 || Math.hypot(x - 59, y - 17) < 4) setT(game, x, y, "rock");
  // A sludge pond in the south-west.
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (Math.hypot(x - 9, y - 44) < 3.2) setT(game, x, y, "sludge");
  // Rich soil west of home: the field.
  for (let y = 26; y <= 33; y++) for (let x = 14; x <= 21; x++) setT(game, x, y, "rich_soil");
  // An old road across the south.
  for (let y = 48; y <= 51; y++) for (let x = 0; x < n; x++) setT(game, x, y, (x * 5 + y) % 13 === 0 ? "rubble" : "asphalt");
  put(game, "car_wreck", 12, 49);
  put(game, "car_wreck", 47, 50);
  // A ruined house east of home, with two gaps in its walls, a crate and scrap.
  const rx = 42, ry = 26, rw = 10, rh = 8;
  for (let y = ry; y < ry + rh; y++)
    for (let x = rx; x < rx + rw; x++) {
      setT(game, x, y, "ruin_floor");
      const edge = x === rx || y === ry || x === rx + rw - 1 || y === ry + rh - 1;
      const gap = (x === rx && y === ry + 4) || (x === rx + 5 && y === ry + rh - 1) || (x === rx + rw - 1 && y === ry + 2);
      if (edge && !gap) put(game, "ruin_wall", x, y);
    }
  put(game, "loot_crate", rx + 7, ry + 2);
  put(game, "scrap_pile", rx + 2, ry + 5);
  put(game, "scrap_pile", rx + 6, ry + 5);
  put(game, "scrap_pile", 36, 22);
  put(game, "scrap_pile", 26, 41);
  // Dead trees to the north-west.
  const trees = [
    [10, 8], [13, 7], [16, 9], [11, 11], [14, 12], [18, 11], [20, 8], [9, 14],
    [12, 15], [16, 15], [19, 14], [22, 12], [15, 18], [21, 17], [24, 15], [8, 18],
  ];
  for (const [x, y] of trees) put(game, "dead_tree", x, y);
  // Shrubs here and there.
  const shrubs = [[26, 10], [30, 14], [6, 26], [10, 34], [28, 44], [38, 40], [50, 40], [56, 30], [44, 14], [4, 54]];
  for (const [x, y] of shrubs) put(game, "mutant_shrub", x, y);
}

/** Three named survivors with fixed skills, and enough supplies for every step. */
export function setupTutorialStart(game: Game): void {
  const { x: cx, y: cy } = TUTORIAL_HOME;
  game.home = { layer: 0, x: cx, y: cy };
  const used = new Set<string>();
  const gear = ["pipe_pistol", "machete", "pipe"];
  // Each survivor is good at a few things, so every step has someone who does it well.
  const strong: string[][] = [["construction", "shooting"], ["cooking", "farming"], ["technology", "melee"]];
  const spots = [[0, 0], [1, 0], [0, 1]];
  for (let i = 0; i < 3; i++) {
    const p = makeSurvivor(game, 0, cx + spots[i][0], cy + spots[i][1], used);
    [p.first, p.last, p.nick] = NAMES[i];
    p.age = [34, 27, 45][i];
    p.traits = [];
    delete p.backstory;
    delete p.noWork;
    p.needs = { hunger: 0.9, thirst: 0.9, rest: 0.95, fun: 0.8 };
    game.reg.skills.list.forEach((s, k) => {
      const hi = strong[i].includes(s.id);
      p.skills[k] = { level: hi ? 8 : 3, xp: 0, passion: hi ? 1 : 0 };
    });
    p.weapon = game.reg.items.idx(gear[i]);
    p.clothes = game.reg.items.idx("patched_clothes");
    addMemory(game, p, "survived_the_end");
    game.pawns.set(p.id, p);
  }
  makeFamily(game, [...game.pawns.values()].filter((p) => p.faction === "colony"));
  const supplies: [string, number][] = [["canned_food", 30], ["clean_water", 30], ["scrub_potato", 40], ["scrap", 90], ["wood", 100], ["cloth", 24]];
  supplies.forEach(([item, count], k) => dropItems(game, item, count, 0, cx + 3 + k, cy + 3));
  game.tutorial = { step: 0, flags: [], passedAt: null };
  // Clear sky for the whole tutorial.
  game.weather.kind = "clear";
}

/** Set a flag from the client (camera moved, game paused, survivor selected, work changed). */
export function tutorialFlag(game: Game, flag: TutorialFlag): void {
  const tu = game.tutorial;
  if (tu && !tu.flags.includes(flag)) tu.flags.push(flag);
}

const defOf = (game: Game, def: number) => game.reg.things.list[def];

/** Things on the map, plus blueprints when `plans` is set. */
function hasThing(game: Game, test: (id: string) => boolean, plans = false): boolean {
  for (const t of game.things.values()) if (test(defOf(game, t.def).id)) return true;
  if (plans) for (const b of game.blueprints.values()) if (b.kind === "thing" && test(defOf(game, b.def).id)) return true;
  return false;
}

/** A door the colony built, next to a closed room of at least 6 tiles. */
function builtRoom(game: Game): boolean {
  for (const t of game.things.values()) {
    const d = defOf(game, t.def);
    if (!d.door || !d.build) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const r = roomAt(game, t.layer, t.x + dx, t.y + dy);
      if (r && !r.outdoor && r.size >= 6) return true;
    }
  }
  return false;
}

function bedInRoom(game: Game): boolean {
  for (const t of game.things.values()) {
    if (!defOf(game, t.def).bed) continue;
    const r = roomAt(game, t.layer, t.x, t.y);
    if (r && !r.outdoor) return true;
  }
  return false;
}

function hasCutOrder(game: Game): boolean {
  const L = game.map.layers[0];
  for (let i = 0; i < L.desig.length; i++) if (L.desig[i] === Desig.cut) return true;
  return false;
}

function hasItem(game: Game, id: string): boolean {
  const def = game.reg.items.idx(id);
  for (const s of game.items.values()) if (s.def === def) return true;
  for (const p of game.pawns.values()) if (p.carrying?.def === def) return true;
  return false;
}

/** Is the step's goal reached? */
export function tutorialCheck(game: Game, id: TutorialStepId): boolean {
  const tu = game.tutorial!;
  const colony = [...game.pawns.values()].filter((p) => p.faction === "colony");
  switch (id) {
    case "camera":
    case "select":
    case "work":
      return tu.flags.includes(id);
    case "time":
      return tu.flags.includes("pause");
    case "stockpile":
      return [...game.zones.values()].some((z) => z.kind === "stockpile");
    case "cut":
      // The order, or a tree already gone (a fast player).
      return hasCutOrder(game) || [...game.things.values()].filter((t) => defOf(game, t.def).id === "dead_tree").length < 16;
    case "room":
      return builtRoom(game);
    case "bed":
      return bedInRoom(game);
    case "grow":
      return [...game.zones.values()].some((z) => z.kind === "grow" && !!z.crop);
    case "cook":
      return hasItem(game, "simple_meal");
    case "research":
      // A planned desk is enough: building it takes a while, and the next steps do not need it.
      return hasThing(game, (d) => d === "research_desk", true) && (game.research.current !== null || game.research.done.size > 0);
    case "draft":
      // The flag: a short move can end between two checks.
      return tu.flags.includes("draft") || colony.some((p) => p.drafted && p.order?.kind === "move");
    case "raid":
      return game.story.raidsSurvived > (tu.raidBase ?? 0);
    case "done":
      return false;
  }
}

/** What to tell the player now: i18n key and the UI elements (test ids) to point at, outermost first. */
export function tutorialHint(game: Game, id: TutorialStepId): { key: string; highlight: string[] } {
  const k = `tut.${id}.do`;
  switch (id) {
    case "camera":
    case "draft":
      return { key: k, highlight: id === "draft" ? ["colonists", "draft"] : [] };
    case "time":
      return { key: k, highlight: ["speed-pause"] };
    case "select":
      return { key: k, highlight: ["colonists"] };
    case "stockpile":
      return { key: k, highlight: ["tb-zones", "zone-stockpile"] };
    case "cut":
      return { key: k, highlight: ["tb-orders", "order-cut"] };
    case "room": {
      const walls = hasThing(game, (d) => d === "wood_wall" || d === "scrap_wall", true);
      const door = hasThing(game, (d) => d === "scrap_door", true);
      if (!walls) return { key: k, highlight: ["tb-build", "build-tab-structure", "build-wood_wall"] };
      if (!door) return { key: "tut.room.door", highlight: ["tb-build", "build-tab-structure", "build-scrap_door"] };
      return { key: "tut.room.wait", highlight: [] };
    }
    case "bed":
      if (!hasThing(game, (d) => !!game.reg.things.list[game.reg.things.idx(d)].bed, true)) return { key: k, highlight: ["tb-build", "build-tab-furniture", "build-bedroll"] };
      return { key: "tut.bed.wait", highlight: [] };
    case "grow":
      return { key: k, highlight: ["tb-zones", "zone-grow-scrub_potato_plant"] };
    case "work":
      return { key: k, highlight: ["tb-work"] };
    case "cook":
      if (!hasThing(game, (d) => d === "campfire" || d === "stove", true)) return { key: k, highlight: ["tb-build", "build-tab-furniture", "build-campfire"] };
      return { key: "tut.cook.wait", highlight: [] };
    case "research":
      if (!hasThing(game, (d) => d === "research_desk", true)) return { key: k, highlight: ["tb-build", "build-tab-production", "build-research_desk"] };
      return { key: "tut.research.pick", highlight: ["tb-research", "research-field_medicine"] };
    case "raid":
      return { key: k, highlight: ["draft-all"] };
    case "done":
      return { key: k, highlight: [] };
  }
}

/** Two weak raiders with pipes walk in from the east edge. */
function spawnTutorialRaid(game: Game): void {
  const id = game.newId();
  game.groups.set(id, { id, kind: "raid", size: RAID_TILES.length, fleeing: false, arrived: game.tick });
  for (const { x, y } of RAID_TILES) {
    const p = makeHostile(game, "human", "raiders", 0, x, y, id, "pipe");
    p.armor = [];
    game.pawns.set(p.id, p);
  }
  game.message("tut.raid.msg", {}, "bad", { layer: 0, ...RAID_TILES[0] });
}

function enterStep(game: Game, id: TutorialStepId): void {
  const tu = game.tutorial!;
  if (id === "raid") {
    tu.raidBase = game.story.raidsSurvived;
    spawnTutorialRaid(game);
  } else if (id === "done") {
    // Free play: survivors find their own work again, and the weather changes again.
    game.opts.idleWork = true;
    game.message("tut.done.msg", {}, "info");
  }
}

/** Skip the current step (the player is stuck or knows it already). */
export function skipTutorialStep(game: Game): void {
  const tu = game.tutorial;
  if (!tu || !tutorialActive(game)) return;
  tu.step++;
  tu.passedAt = null;
  enterStep(game, TUTORIAL_STEPS[tu.step]);
}

/** End the tutorial now and keep playing. */
export function endTutorial(game: Game): void {
  const tu = game.tutorial;
  if (!tu || !tutorialActive(game)) return;
  tu.step = TUTORIAL_STEPS.indexOf("done");
  tu.passedAt = null;
  enterStep(game, "done");
}

export function tickTutorial(game: Game): void {
  const tu = game.tutorial;
  if (!tu || !tutorialActive(game) || game.tick % 10 !== 0) return;
  const id = TUTORIAL_STEPS[tu.step];
  if (tu.passedAt === null) {
    if (tutorialCheck(game, id)) tu.passedAt = game.tick;
    return;
  }
  if (game.tick - tu.passedAt < TUTORIAL_PAUSE) return;
  tu.step++;
  tu.passedAt = null;
  enterStep(game, TUTORIAL_STEPS[tu.step]);
}
