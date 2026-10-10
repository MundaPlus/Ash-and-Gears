/**
 * Title screen, new-game setup and the in-game menu (save, load, settings).
 * Starting or loading a game reloads the page with the choice in the URL or session storage;
 * that keeps boot simple and leaves no state from the old game behind.
 */
import { t } from "@wc/data";
import { useEffect, useState } from "preact/hooks";
import { ART_SIZES } from "../render/textures.ts";
import { listSlots, type SlotInfo } from "../storage.ts";
import { actions, useStore } from "./store.ts";

export interface NewGameOptions {
  storyteller: "sheriff" | "grandma" | "chaos";
  raid: number;
  mutant: number;
  rad: number;
  size: number;
  day: number;
  seed: string;
}

export function startNewGame(o: NewGameOptions) {
  const q = new URLSearchParams({ seed: o.seed || Math.random().toString(36).slice(2, 8), story: o.storyteller, raid: String(o.raid), mutant: String(o.mutant), rad: String(o.rad), size: String(o.size), day: String(o.day) });
  location.search = q.toString();
}

export function loadSlot(id: string) {
  try {
    sessionStorage.setItem("wc-load", id);
  } catch {
    // no session storage: loading cannot work in this browser
  }
  location.search = "load=1";
}

function Slots({ onPick }: { onPick: (s: SlotInfo) => void }) {
  const [slots, setSlots] = useState<SlotInfo[] | null>(null);
  useEffect(() => {
    listSlots().then(setSlots);
  }, []);
  if (slots === null) return <p class="hint">…</p>;
  if (!slots.length) return <p class="hint">{t("menu.no_saves")}</p>;
  return (
    <ul class="slots">
      {slots.map((s) => (
        <li key={s.id}>
          <button onClick={() => onPick(s)} data-testid={`slot-${s.id}`}>
            <b>{s.name}</b>
            <small>{t("menu.slot_info", { day: s.day, n: s.colonists, seed: s.seed, when: new Date(s.savedAt).toLocaleString() })}</small>
          </button>
        </li>
      ))}
    </ul>
  );
}

function NewGame({ onBack }: { onBack: () => void }) {
  const [o, setO] = useState<NewGameOptions>({ storyteller: "sheriff", raid: 1, mutant: 1, rad: 1, size: 200, day: 360, seed: "" });
  const slider = (key: "raid" | "mutant" | "rad") => (
    <label class="slider">
      <span>{t(`newgame.${key}`)}</span>
      <input id={`ng-${key}`} type="range" min="0" max="2" step="0.25" value={o[key]} onInput={(e) => setO({ ...o, [key]: Number((e.target as HTMLInputElement).value) })} />
      <b>{Math.round(o[key] * 100)}%</b>
    </label>
  );
  return (
    <div class="screen-body" data-testid="new-game">
      <h2>{t("newgame.title")}</h2>
      <h3>{t("newgame.storyteller")}</h3>
      <div class="choices">
        {(["grandma", "sheriff", "chaos"] as const).map((s) => (
          <button key={s} class={o.storyteller === s ? "on" : ""} onClick={() => setO({ ...o, storyteller: s })}>
            <b>{t(`story.${s}`)}</b>
            <small>{t(`story.${s}.desc`)}</small>
          </button>
        ))}
      </div>
      <h3>{t("newgame.sliders")}</h3>
      {slider("raid")}
      {slider("mutant")}
      {slider("rad")}
      <h3>{t("newgame.world")}</h3>
      <div class="choices">
        {[128, 200, 256].map((n) => (
          <button key={n} class={o.size === n ? "on" : ""} onClick={() => setO({ ...o, size: n })}>
            <b>{t(`newgame.size_${n}`)}</b>
            <small>{n} × {n}</small>
          </button>
        ))}
      </div>
      <div class="choices">
        {[240, 360, 600].map((n) => (
          <button key={n} class={o.day === n ? "on" : ""} onClick={() => setO({ ...o, day: n })}>
            <b>{t("newgame.day", { min: n / 60 })}</b>
          </button>
        ))}
      </div>
      <label class="slider">
        <span>{t("newgame.seed")}</span>
        <input id="ng-seed" type="text" value={o.seed} placeholder={t("newgame.seed_random")} onInput={(e) => setO({ ...o, seed: (e.target as HTMLInputElement).value })} />
      </label>
      <div class="row">
        <button onClick={onBack}>{t("menu.back")}</button>
        <button class="primary" data-testid="start-game" onClick={() => startNewGame(o)}>
          {t("newgame.start")}
        </button>
      </div>
    </div>
  );
}

export function TitleScreen({ hasAutosave }: { hasAutosave: boolean }) {
  const [view, setView] = useState<"main" | "new" | "load">("main");
  return (
    <div class="screen title" data-testid="title-screen">
      <div class="titlebox">
        <p class="eyebrow">{t("title.eyebrow")}</p>
        <h1>{t("title.name")}</h1>
        <p class="tag">{t("title.tagline")}</p>
        {view === "main" && (
          <div class="mainbtns">
            {hasAutosave && (
              <button class="primary" data-testid="continue" onClick={() => loadSlot("autosave")}>
                {t("title.continue")}
              </button>
            )}
            <button class={hasAutosave ? "" : "primary"} data-testid="new-game-btn" onClick={() => setView("new")}>
              {t("title.new")}
            </button>
            <button onClick={() => setView("load")}>{t("title.load")}</button>
          </div>
        )}
        {view === "new" && <NewGame onBack={() => setView("main")} />}
        {view === "load" && (
          <div class="screen-body">
            <Slots onPick={(s) => loadSlot(s.id)} />
            <button onClick={() => setView("main")}>{t("menu.back")}</button>
          </div>
        )}
      </div>
    </div>
  );
}

export function GameMenu() {
  const s = useStore();
  const [tab, setTab] = useState<"save" | "settings" | "new">("save");
  const [saved, setSaved] = useState<string | null>(null);
  if (!s.menuOpen) return null;
  return (
    <div class="screen overlay" data-testid="game-menu">
      <div class="titlebox">
        <div class="tabs">
          {(["save", "settings", "new"] as const).map((k) => (
            <button key={k} class={tab === k ? "on" : ""} onClick={() => setTab(k)}>
              {t(`menu.tab_${k}`)}
            </button>
          ))}
          <button class="close" onClick={() => actions.toggleMenu()} aria-label={t("ui.close")}>
            ×
          </button>
        </div>
        {tab === "save" && (
          <div class="screen-body">
            <div class="menugoals">
              <h3>{t("goal.title")}</h3>
              {s.goals.map((g) => (
                <p key={g.id} class={g.done ? "done" : ""}>
                  {g.done ? "✔" : "○"} {t(`goal.${g.id}`)}
                </p>
              ))}
            </div>
            <div class="row">
              <button
                class="primary"
                data-testid="save-now"
                onClick={async () => {
                  const name = await actions.saveGame(null);
                  setSaved(name);
                }}
              >
                {t("menu.save")}
              </button>
            </div>
            {saved && <p class="hint">{t("menu.saved", { name: saved })}</p>}
            <h3>{t("menu.load")}</h3>
            <Slots onPick={(sl) => loadSlot(sl.id)} />
          </div>
        )}
        {tab === "settings" && (
          <div class="screen-body">
            <h3>{t("settings.art")}</h3>
            <div class="choices">
              {["rust", "toxic", "ash"].map((p) => (
                <button key={p} class={s.art.palette === p ? "on" : ""} data-testid={`palette-${p}`} onClick={() => actions.setArt({ palette: p })}>
                  <b>{t(`palette.${p}`)}</b>
                </button>
              ))}
            </div>
            <div class="choices">
              {ART_SIZES.map((z) => (
                <button key={z} class={s.art.size === z ? "on" : ""} data-testid={`px-${z}`} onClick={() => actions.setArt({ size: z })}>
                  <b>{t(`settings.px_${z}`)}</b>
                </button>
              ))}
            </div>
            <h3>{t("settings.audio")}</h3>
            {(["music", "sfx"] as const).map((k) => (
              <label class="slider" key={k}>
                <span>{t(`settings.${k}`)}</span>
                <input id={`vol-${k}`} type="range" min="0" max="1" step="0.05" value={s.volume[k]} onInput={(e) => actions.setVolume(k, Number((e.target as HTMLInputElement).value))} />
                <b>{Math.round(s.volume[k] * 100)}%</b>
              </label>
            ))}
            <h3>{t("settings.ui")}</h3>
            <div class="choices">
              {[0.9, 1, 1.15, 1.3].map((z) => (
                <button key={z} class={s.uiScale === z ? "on" : ""} onClick={() => actions.setUiScale(z)}>
                  <b>{Math.round(z * 100)}%</b>
                </button>
              ))}
            </div>
          </div>
        )}
        {tab === "new" && <NewGame onBack={() => setTab("save")} />}
      </div>
    </div>
  );
}
