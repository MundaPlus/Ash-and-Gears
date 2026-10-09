/** Tiny observable store. The game loop writes, Preact components read. */
import { useEffect, useState } from "preact/hooks";

export interface Inspect {
  title: string;
  lines: string[];
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
  closeInspect: () => store.set({ inspect: null }),
};

export function useStore(): UiState {
  const [, force] = useState(0);
  useEffect(() => store.subscribe(() => force((n) => n + 1)), []);
  return store.state;
}
