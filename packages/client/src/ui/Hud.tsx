import { t } from "@wc/data";
import { useState } from "preact/hooks";
import { ColonistBar } from "./ColonistBar.tsx";
import { Ending } from "./Ending.tsx";
import { PawnPanel } from "./PawnPanel.tsx";
import { actions, useStore } from "./store.ts";
import { Toasts } from "./Toasts.tsx";
import { Toolbar } from "./Toolbar.tsx";
import { MakeWindow } from "./MakeWindow.tsx";
import { GameMenu } from "./Screens.tsx";

export function Hud() {
  const [makeOpen, setMakeOpen] = useState(false);
  /** Stockpile panel: the category whose item list is open. */
  const [openCat, setOpenCat] = useState<string | null>(null);
  const [folded, setFolded] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem("wc-fold") ?? "{}");
    } catch {
      return {};
    }
  });
  const toggleFold = (k: string) => {
    const next = { ...folded, [k]: !folded[k] };
    setFolded(next);
    try {
      localStorage.setItem("wc-fold", JSON.stringify(next));
    } catch {
      // no storage: the fold lasts for this page only
    }
  };
  const s = useStore();
  // Names by level: tower floors count from the ground floor ("Floor 2"), underground as before.
  const level = s.layerLevels[s.layer] ?? 0;
  const layerName = level > 0 ? t("layer.floor", { n: level + 1 }) : -level <= 2 ? t(`layer.${-level}`) : t("layer.n", { n: -level });
  const hasLevel = (lv: number) => s.layerLevels.includes(lv);
  return (
    <>
      <div class="topleft">
        <div class="resources" data-testid="resources">
          {s.resources.map((r) => (
            <span key={r.id} class="res" title={r.loose > 0 ? t("res.loose", { n: r.loose }) : undefined}>
              {t(`res.${r.id}`)} <b>{r.count}</b>
              {r.loose > 0 && <small class="loose">+{r.loose}</small>}
            </span>
          ))}
        </div>
        <ColonistBar />
      </div>
      <Toasts />
      <Toolbar />
      <GameMenu />
      {((s.goals.length > 0 && !s.goals.every((g) => g.done)) || s.alerts.length > 0 || s.story) && (
        <aside class="goals" data-testid="goals">
          {s.story && (
            <div class="story" data-testid="story">
              <h3 class="fold" onClick={() => toggleFold("story")}>
                {folded.story ? "▸" : "▾"} {t(`line.${s.story.line}`)}
              </h3>
              <b>{t(`story.${s.story.line}.${s.story.beat}`)}</b>
              {!folded.story && s.story.goals.map((g, i) => (
                <p key={i} class={g.met ? "done" : ""}>
                  {g.met ? "✔" : "○"} {t(g.key, g.params)}
                </p>
              ))}
            </div>
          )}
          {s.goals.length > 0 && !s.goals.every((g) => g.done) && (
            <>
              <h3 class="fold" onClick={() => toggleFold("goals")}>
                {folded.goals ? "▸" : "▾"} {t("goal.title")}
              </h3>
              {!folded.goals && s.goals.map((g) => (
                <p key={g.id} class={g.done ? "done" : ""}>
                  {g.done ? "✔" : "○"} {t(`goal.${g.id}`)}
                </p>
              ))}
              {s.goalHint && !folded.goals && (
                <p class="hint" data-testid="goal-hint">
                  {t(s.goalHint)}
                </p>
              )}
            </>
          )}
          {s.alerts.length > 0 && (
            <div class="alerts" data-testid="alerts">
              {s.alerts.map((a) => (
                <button key={a.key} class={`alert ${a.level}`} disabled={!a.at} onClick={() => a.at && actions.jumpTo(a.at)}>
                  {t(a.key, a.params)}
                </button>
              ))}
            </div>
          )}
        </aside>
      )}
      {s.banner && (
        <div class="banner" key={s.banner.title} data-testid="banner">
          <small>{s.banner.kicker}</small>
          <b>{s.banner.title}</b>
        </div>
      )}
      <PawnPanel />
      <Ending />
      {s.pawnMenu && (
        <div class="pawnmenu" data-testid="pawn-menu" style={{ left: `${s.pawnMenu.x}px`, top: `${s.pawnMenu.y}px` }}>
          <b>{s.pawnMenu.title}</b>
          {s.pawnMenu.options.map((o) => (
            <button key={o} data-testid={`pawn-menu-${o}`} onClick={() => actions.pawnMenuPick(o)}>
              {t(`pawnmenu.${o}`)}
            </button>
          ))}
          <button class="dim" onClick={() => actions.pawnMenuPick(null)}>
            {t("pawnmenu.close")}
          </button>
        </div>
      )}
      <header class="topbar">
        {/* The tool hint takes the top center while a tool is active; the song name steps aside. */}
        {s.song && !s.toolLabel && (
          <div class="nowplaying" data-testid="song" title={t("music.now_playing")}>
            <span aria-hidden="true">♪</span> {t(`music.${s.song}`)}
          </div>
        )}
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
        <button data-testid="layer-up" disabled={!hasLevel(level + 1)} onClick={() => actions.stepLayer(1)} title={t("layer.up")} aria-label={t("layer.up")}>
          ▲
        </button>
        <span data-testid="layer-name">{layerName}</span>
        <button
          data-testid="layer-down"
          disabled={!hasLevel(level - 1)}
          onClick={() => actions.stepLayer(-1)}
          title={t("layer.down")}
          aria-label={t("layer.down")}
        >
          ▼
        </button>
        <button data-testid="power-overlay" class={s.powerOverlay ? "on" : ""} onClick={() => actions.togglePowerOverlay()} title={t("overlay.power")} aria-label={t("overlay.power")}>
          ⚡
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
          {s.inspect.actions && (
            <div class="tileactions" data-testid="tile-actions">
              {s.inspect.actions.list.map((a) => (
                <button key={a} class={s.inspect!.actions!.first === a ? "on" : ""} data-testid={`act-${a}`} onClick={() => actions.tileAction(a)}>
                  {t(`action.${a}`)}
                  {s.inspect!.actions!.first === a && <kbd>F</kbd>}
                </button>
              ))}
            </div>
          )}
          {(s.inspect.make || s.inspect.researchLink) && (
            <div class="row benchbtns">
              {s.inspect.make && (
                <button class="primary" data-testid="open-make" onClick={() => setMakeOpen(true)}>
                  {t("make.open")} {s.inspect.make.queue.length > 0 && <small>({s.inspect.make.queue.length}/5)</small>}
                </button>
              )}
              {s.inspect.researchLink && (
                <button data-testid="open-research" onClick={() => actions.openMenu("research")}>
                  {t("make.research")}
                </button>
              )}
            </div>
          )}
          {makeOpen && s.inspect.make && <MakeWindow make={s.inspect.make} onClose={() => setMakeOpen(false)} />}
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
                <button key={r} class={`recipe ${s.inspect!.crafter!.current === r ? "on" : ""}`} onClick={() => actions.setCrafterRecipe(s.inspect!.crafter!.thingId, r)}>
                  <b>{t(`recipe.${r}`)}</b>
                  {s.inspect!.crafter!.needs?.[r] && <small>{s.inspect!.crafter!.needs[r]}</small>}
                </button>
              ))}
            </div>
          )}
          {s.inspect.zone && (
            <div class="row benchbtns" data-testid="zone-tools">
              <button
                data-testid="zone-grow-btn"
                onClick={() => actions.setTool(s.inspect!.zone!.kind === "grow" ? { kind: "zone", zone: "grow", crop: s.inspect!.zone!.crop! } : { kind: "zone", zone: "stockpile" })}
                title={t("zone.grow_hint")}
              >
                {t("zone.grow_btn")}
              </button>
              <button data-testid="zone-shrink-btn" onClick={() => actions.setTool({ kind: "zone", zone: "remove" })} title={t("zone.shrink_hint")}>
                {t("zone.shrink_btn")}
              </button>
            </div>
          )}
          {s.inspect.stockpile && (
            <div class="bills" data-testid="stockpile">
              <h3>{t("stockpile.title")}</h3>
              <div class="prio-row">
                <span>{t("stockpile.priority")}</span>
                {[1, 2, 3, 4].map((n) => (
                  <button key={n} class={s.inspect!.stockpile!.priority === n ? "on" : ""} data-testid={`stock-prio-${n}`} onClick={() => actions.setZonePriority(s.inspect!.stockpile!.zoneId, n)}>
                    {t(`stockpile.prio_${n}`)}
                  </button>
                ))}
              </div>
              {s.inspect.stockpile.cats.map((c) => {
                const sp = s.inspect!.stockpile!;
                return (
                  <div key={c.id} class="stock-cat">
                    <div class="stock-cat-row">
                      <button class={c.state === "on" ? "on" : c.state === "partial" ? "partial" : ""} data-testid={`stock-cat-${c.id}`} onClick={() => actions.setZoneAllow(sp.zoneId, c.id, c.state !== "on")}>
                        {t(`category.${c.id}`)}
                        {c.state === "partial" && <small> {t("stockpile.partial", { n: c.items.filter((i) => i.on).length, of: c.items.length })}</small>}
                      </button>
                      <button class="open" data-testid={`stock-open-${c.id}`} title={t("stockpile.items_hint")} onClick={() => setOpenCat(openCat === c.id ? null : c.id)}>
                        {openCat === c.id ? "▾" : "▸"}
                      </button>
                    </div>
                    {openCat === c.id && (
                      <div class="stock-items">
                        {c.items.map((i) => (
                          <button key={i.id} class={i.on ? "on" : ""} data-testid={`stock-item-${i.id}`} onClick={() => actions.setZoneItem(sp.zoneId, i.id, !i.on)}>
                            {t(`item.${i.id}`)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              <div class="benchbtns">
                <button data-testid="stock-copy" onClick={() => actions.copyZoneFilter(s.inspect!.stockpile!.zoneId)}>
                  {t("stockpile.copy")}
                </button>
                <button data-testid="stock-paste" disabled={!s.inspect.stockpile.canPaste} onClick={() => actions.pasteZoneFilter(s.inspect!.stockpile!.zoneId)}>
                  {t("stockpile.paste")}
                </button>
              </div>
            </div>
          )}
          {s.inspect.bed && (
            <div class="bills bed-use" data-testid="bed-use">
              {(["colonist", "prisoner", "medical"] as const).map((use) => (
                <button key={use} class={s.inspect!.bed!.use === use ? "on" : ""} title={t(`bed.${use}.desc`)} onClick={() => actions.setBedUse(s.inspect!.bed!.thingId, use)}>
                  {t(`bed.${use}`)}
                </button>
              ))}
            </div>
          )}
          {s.inspect.power && (
            <div class="bills" data-testid="power">
              {s.inspect.power.switchOn !== undefined && (
                <button class={s.inspect.power.switchOn ? "on" : ""} onClick={() => actions.setSwitch(s.inspect!.power!.thingId, !s.inspect!.power!.switchOn)}>
                  {t(s.inspect.power.switchOn ? "power.switch_on" : "power.switch_off")}
                </button>
              )}
              {s.inspect.power.priority !== undefined && (
                <>
                  <h3>{t("power.priority")}</h3>
                  {[1, 2, 3].map((n) => (
                    <button key={n} class={s.inspect!.power!.priority === n ? "on" : ""} onClick={() => actions.setPriority(s.inspect!.power!.thingId, n)}>
                      {t(`power.priority.${n}`)}
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
          {s.inspect.filter && (
            <div class="bills" data-testid="filter">
              <h3>{t("filter.title")}</h3>
              <button class={s.inspect.filter.current === null ? "on" : ""} onClick={() => actions.setFilter(s.inspect!.filter!.thingId, null)}>
                {t("filter.any")}
              </button>
              {s.inspect.filter.options.map((id) => (
                <button key={id} class={s.inspect!.filter!.current === id ? "on" : ""} onClick={() => actions.setFilter(s.inspect!.filter!.thingId, id)}>
                  {t(`item.${id}`)}
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
