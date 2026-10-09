import { t } from "@wc/data";
import { ColonistBar } from "./ColonistBar.tsx";
import { PawnPanel } from "./PawnPanel.tsx";
import { actions, useStore } from "./store.ts";
import { Toasts } from "./Toasts.tsx";
import { Toolbar } from "./Toolbar.tsx";

export function Hud() {
  const s = useStore();
  const layerName = s.layer <= 1 ? t(`layer.${s.layer}`) : t("layer.n", { n: s.layer });
  return (
    <>
      <div class="topleft">
        <div class="resources" data-testid="resources">
          {s.resources.map((r) => (
            <span key={r.id} class="res">
              {t(`res.${r.id}`)} <b>{r.count}</b>
            </span>
          ))}
        </div>
        <ColonistBar />
      </div>
      <Toasts />
      <Toolbar />
      <PawnPanel />
      <header class="topbar">
        <div class="clock" data-testid="clock">
          <b>{s.clock}</b>
          <span>{s.season}</span>
        </div>
        <div class="speed" role="group">
          <button class={s.paused ? "on" : ""} onClick={actions.togglePause} title={t("speed.pause")} aria-label={t("speed.pause")}>
            ❚❚
          </button>
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              class={!s.paused && s.speed === n ? "on" : ""}
              onClick={() => actions.setSpeed(n)}
              title={t("speed.n", { n })}
              aria-label={t("speed.n", { n })}
            >
              {"▶".repeat(n)}
            </button>
          ))}
        </div>
      </header>

      <div class="layerbox">
        <button data-testid="layer-up" disabled={s.layer === 0} onClick={() => actions.setLayer(s.layer - 1)} title={t("layer.up")} aria-label={t("layer.up")}>
          ▲
        </button>
        <span data-testid="layer-name">{layerName}</span>
        <button
          data-testid="layer-down"
          disabled={s.layer >= s.layerCount - 1}
          onClick={() => actions.setLayer(s.layer + 1)}
          title={t("layer.down")}
          aria-label={t("layer.down")}
        >
          ▼
        </button>
      </div>

      {s.inspect && !s.pawn && (
        <aside class="inspect" data-testid="inspect">
          <button class="close" onClick={actions.closeInspect} aria-label={t("ui.close")}>
            ×
          </button>
          <h2>{s.inspect.title}</h2>
          {s.inspect.lines.map((l) => (
            <p key={l}>{l}</p>
          ))}
        </aside>
      )}

      <footer class="debug">
        seed {s.seed} · {s.fps} fps
      </footer>
    </>
  );
}
