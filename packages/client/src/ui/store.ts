/** Tiny observable store. The game loop writes, Preact components read. */
import { useEffect, useState } from "preact/hooks";

export interface Inspect {
  title: string;
  lines: string[];
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
  menu: "build" | "orders" | "zones" | "work" | null;
  /** i18n key + params describing the active tool, or null. */
  toolLabel: string | null;
  buildOptions: BuildOption[];
  workTypes: string[];
  workRows: WorkRow[];
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
