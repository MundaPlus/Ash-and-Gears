import { t } from "@wc/data";
import { ColonistBar } from "./ColonistBar.tsx";
import { PawnPanel } from "./PawnPanel.tsx";
import { actions, useStore } from "./store.ts";
import { Toasts } from "./Toasts.tsx";
import { Toolbar } from "./Toolbar.tsx";
import { GameMenu } from "./Screens.tsx";

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
      <GameMenu />
      {s.goals.length > 0 && !s.goals.every((g) => g.done) && (
        <aside class="goals" data-testid="goals">
          <h3>{t("goal.title")}</h3>
          {s.goals.map((g) => (
            <p key={g.id} class={g.done ? "done" : ""}>
              {g.done ? "✔" : "○"} {t(`goal.${g.id}`)}
            </p>
          ))}
        </aside>
      )}
      <PawnPanel />
      <header class="topbar">
        <div class="clock" data-testid="clock">
          <b>{s.clock}</b>
          <span>
            {s.season} · <em class={`wx ${s.weather}`}>{t(`weather.${s.weather}`)}</em>
          </span>
        </div>
        <button class="menubtn" data-testid="menu-btn" onClick={actions.toggleMenu} title={t("menu.title")} aria-label={t("menu.title")}>
          ☰
        </button>
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

      {(s.weather === "rad_cloud" || s.radWarning !== null) && (
        <div class="radbanner" data-testid="rad-banner">
          {s.weather === "rad_cloud" ? t("weather.rad_banner") : t("weather.rad_warning", { hours: s.radWarning ?? 0 })}
        </div>
      )}
      {s.inspect && !s.pawn && (
        <aside class="inspect" data-testid="inspect">
          <button class="close" onClick={actions.closeInspect} aria-label={t("ui.close")}>
            ×
          </button>
          <h2>{s.inspect.title}</h2>
          {s.inspect.lines.map((l) => (
            <p key={l}>{l}</p>
          ))}
          {s.inspect.bills && s.inspect.bills.length > 0 && (
            <div class="bills" data-testid="bills">
              <h3>{t("bills.title")}</h3>
              {s.inspect.bills.map((b) => (
                <div class="bill" key={b.recipe}>
                  <span>{t(`recipe.${b.recipe}`)}</span>
                  <span class="num">
                    {b.stock}/{b.target}
                  </span>
                  <button onClick={() => actions.setBillTarget(b.benchId, b.recipe, b.target - 1)} aria-label="-">
                    −
                  </button>
                  <button onClick={() => actions.setBillTarget(b.benchId, b.recipe, b.target + 1)} aria-label="+">
                    +
                  </button>
                </div>
              ))}
              <p class="hint">{t("bills.hint")}</p>
            </div>
          )}
          {s.inspect.crafter && (
            <div class="bills" data-testid="crafter">
              <h3>{t("crafter.title")}</h3>
              {s.inspect.crafter.options.map((r) => (
                <button key={r} class={s.inspect!.crafter!.current === r ? "on" : ""} onClick={() => actions.setCrafterRecipe(s.inspect!.crafter!.thingId, r)}>
                  {t(`recipe.${r}`)}
                </button>
              ))}
            </div>
          )}
        </aside>
      )}

      <footer class="debug">
        seed {s.seed} · {s.fps} fps
      </footer>
    </>
  );
}
