/** Tiny observable store. The game loop writes, Preact components read. */
import { useEffect, useState } from "preact/hooks";

export interface Inspect {
  title: string;
  lines: string[];
  bills?: { benchId: number; recipe: string; target: number; stock: number }[];
  /** Auto-crafter: recipe choice. */
  crafter?: { thingId: number; current: string | null; options: string[] };
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

export interface WorkRow {
  id: number;
  nick: string;
  color: string;
  work: Record<string, number>;
  skills: Record<string, number>;
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
  menu: "build" | "orders" | "zones" | "work" | "research" | null;
  /** i18n key + params describing the active tool, or null. */
  toolLabel: string | null;
  buildOptions: BuildOption[];
  workTypes: string[];
  workRows: WorkRow[];
  weather: string;
  research: ResearchRow[];
  /** Rotation of the build tool (0 = east). */
  toolRot: number;
  art: { palette: string; size: "16" | "32" };
  menuOpen: boolean;
  volume: { music: number; sfx: number };
  uiScale: number;
  goals: { id: string; done: boolean }[];
  /** Hours until a radiation cloud, or null. */
  radWarning: number | null;
}

type Listener = () => void;

class Store {
  state: UiState = {
    speed: 1,
    paused: false,
    layer: 0,
    layerCount: 1,
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
  selectPawn: (_id: number | null, _center = false) => {},
  setTool: (_spec: import("../input/tools.ts").ToolSpec | null) => {},
  setWork: (_pawn: number, _work: string, _value: number) => {},
  setBillTarget: (_bench: number, _recipe: string, _n: number) => {},
  toggleDraft: (_id: number) => {},
  setResearch: (_id: string | null) => {},
  setArt: (_patch: Partial<{ palette: string; size: "16" | "32" }>) => {},
  toggleMenu: () => store.set({ menuOpen: !store.state.menuOpen }),
  saveGame: async (_name: string | null): Promise<string> => "",
  setVolume: (_k: "music" | "sfx", _v: number) => {},
  setUiScale: (_s: number) => {},
  rotateTool: (_d: number) => {},
  setCrafterRecipe: (_thing: number, _recipe: string) => {},
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
