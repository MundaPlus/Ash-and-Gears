import type { ArtSize } from "../render/textures.ts";
/** Tiny observable store. The game loop writes, Preact components read. */
import { useEffect, useState } from "preact/hooks";

export interface Inspect {
  title: string;
  lines: string[];
  bills?: { benchId: number; recipe: string; target: number; stock: number }[];
  /** Auto-crafter: recipe choice. */
  crafter?: { thingId: number; current: string | null; options: string[] };
  /** Beds: for prisoners or not. */
  prisonBed?: { thingId: number; on: boolean };
  /** Power consumers: priority; switches: on or off. */
  power?: { thingId: number; priority?: number; switchOn?: boolean };
  /** Sorter belts and robot arms: the one item they handle (null = any). */
  filter?: { thingId: number; current: string | null; options: string[] };
}

export interface ColonistSummary {
  id: number;
  nick: string;
  mood: number;
  color: string;
  job: string;
  warn: string | null;
}

export interface PawnDetail {
  id: number;
  name: string;
  age: number;
  color: string;
  mood: number;
  moodTarget: number;
  job: string;
  needs: { id: string; value: number }[];
  rad: number;
  faction: string;
  drafted: boolean;
  downed: boolean;
  weapon: string | null;
  bloodLoss: number;
  pain: number;
  injuries: { part: string; kind: string; dmg: number; tended: boolean }[];
  missing: string[];
  skills: { id: string; level: number; passion: number }[];
  traits: string[];
  /** Colony robot: charge 0..1 instead of needs and mood. */
  robot: boolean;
  charge: number;
  /** Downed raider marked for capture; prisoner resistance. */
  capture: boolean;
  resistance: number;
  /** [childhood, adulthood] backstory ids. */
  backstory: string[];
  noWork: string[];
  relations: { nick: string; opinion: number; label: string }[];
  thoughts: { id: string; mood: number }[];
}

export interface Toast {
  id: number;
  text: string;
  level: "info" | "warn" | "bad";
  until: number;
}

export interface BuildOption {
  defKind: "thing" | "floor";
  def: string;
  menu: string;
  cost: { item: string; n: number }[];
  /** Research needed first, or null. */
  locked: string | null;
  rotatable: boolean;
}

export interface ResearchRow {
  id: string;
  tier: number;
  state: string;
  progress: number;
  cost: number;
  prereqs: string[];
  blueprint?: string;
  current: boolean;
}

export interface CaravanUi {
  faction: string;
  hoursLeft: number;
  markup: number;
  rows: { id: string; yours: number; theirs: number; value: number }[];
  problem: string | null;
}

export interface WorldUi {
  w: number;
  h: number;
  biome: string[];
  home: { x: number; y: number };
  sites: { id: number; x: number; y: number; kind: string; richness: number; danger: number; travel: number; outpost: number | null; food: number; water: number }[];
  expeditions: { id: number; site: string; stage: string; hoursLeft: number; names: string[] }[];
  free: { id: number; nick: string }[];
  outpostCost: { item: string; n: number }[];
  factions: { id: string; goodwill: number; relation: string }[];
  /** i18n key of the last launch problem, or null. */
  problem: string | null;
}

export interface WorkRow {
  id: number;
  nick: string;
  color: string;
  work: Record<string, number>;
  skills: Record<string, number>;
  /** Work types the backstory rules out. */
  noWork: string[];
}

export interface UiState {
  speed: number;
  paused: boolean;
  layer: number;
  layerCount: number;
  clock: string;
  season: string;
  seed: string;
  fps: number;
  inspect: Inspect | null;
  colonists: ColonistSummary[];
  pawn: PawnDetail | null;
  toasts: Toast[];
  resources: { id: string; count: number }[];
  /** Open toolbar menu. */
  menu: "build" | "orders" | "zones" | "work" | "research" | "world" | "trade" | null;
  /** Trader caravan near home (A9), or null. */
  caravan: CaravanUi | null;
  /** World map panel data (A8), filled while the panel is open. */
  world: WorldUi | null;
  /** i18n key + params describing the active tool, or null. */
  toolLabel: string | null;
  buildOptions: BuildOption[];
  workTypes: string[];
  workRows: WorkRow[];
  weather: string;
  research: ResearchRow[];
  /** Rotation of the build tool (0 = east). */
  toolRot: number;
  art: { palette: string; size: ArtSize };
  menuOpen: boolean;
  volume: { music: number; sfx: number };
  uiScale: number;
  goals: { id: string; done: boolean }[];
  /** i18n key: the next step toward the first open goal. */
  goalHint: string | null;
  /** Hours until a radiation cloud, or null. */
  radWarning: number | null;
  /** Power overlay on (networks in colors, cut machines in red). */
  powerOverlay: boolean;
}

type Listener = () => void;

class Store {
  state: UiState = {
    speed: 1,
    paused: false,
    layer: 0,
    layerCount: 1,
    world: null,
    caravan: null,
    powerOverlay: false,
    clock: "",
    season: "",
    seed: "",
    fps: 0,
    inspect: null,
    colonists: [],
    pawn: null,
    toasts: [],
    resources: [],
    menu: null,
    toolLabel: null,
    buildOptions: [],
    workTypes: [],
    workRows: [],
    weather: "clear",
    research: [],
    toolRot: 0,
    art: { palette: "rust", size: "16" },
    menuOpen: false,
    volume: { music: 0.6, sfx: 0.7 },
    uiScale: 1,
    goals: [],
    goalHint: null,
    radWarning: null,
  };
  private listeners = new Set<Listener>();

  set(patch: Partial<UiState>) {
    let changed = false;
    for (const k of Object.keys(patch) as (keyof UiState)[]) {
      if (this.state[k] !== patch[k]) changed = true;
    }
    if (!changed) return;
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  subscribe(l: Listener) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}

export const store = new Store();

/** Actions the UI can trigger. main.ts fills these in. */
export const actions = {
  setSpeed: (_s: number) => {},
  togglePause: () => {},
  setLayer: (_l: number) => {},
  togglePowerOverlay: () => {},
  setCapture: (_pawn: number, _on: boolean) => {},
  sendExpedition: (_site: number, _pawns: number[], _outpost: boolean) => {},
  trade: (_buy: Record<string, number>, _sell: Record<string, number>) => {},
  release: (_pawn: number) => {},
  setPrisonBed: (_thing: number, _on: boolean) => {},
  setPriority: (_thing: number, _p: number) => {},
  setSwitch: (_thing: number, _on: boolean) => {},
  selectPawn: (_id: number | null, _center = false) => {},
  setTool: (_spec: import("../input/tools.ts").ToolSpec | null) => {},
  setWork: (_pawn: number, _work: string, _value: number) => {},
  setBillTarget: (_bench: number, _recipe: string, _n: number) => {},
  toggleDraft: (_id: number) => {},
  setResearch: (_id: string | null) => {},
  setArt: (_patch: Partial<{ palette: string; size: ArtSize }>) => {},
  toggleMenu: () => store.set({ menuOpen: !store.state.menuOpen }),
  saveGame: async (_name: string | null): Promise<string> => "",
  setVolume: (_k: "music" | "sfx", _v: number) => {},
  setUiScale: (_s: number) => {},
  rotateTool: (_d: number) => {},
  setCrafterRecipe: (_thing: number, _recipe: string) => {},
  setFilter: (_thing: number, _item: string | null) => {},
  draftAll: () => {},
  openMenu: (m: UiState["menu"]) => store.set({ menu: store.state.menu === m ? null : m }),
  closeInspect: () => {
    store.set({ inspect: null });
    actions.selectPawn(null);
  },
};

export function useStore(): UiState {
  const [, force] = useState(0);
  useEffect(() => store.subscribe(() => force((n) => n + 1)), []);
  return store.state;
}
