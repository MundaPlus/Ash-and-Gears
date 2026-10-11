import { t } from "@wc/data";
import { useState } from "preact/hooks";
import { actions, useStore, type BuildOption } from "./store.ts";
import { WorkGrid } from "./WorkGrid.tsx";
import { ResearchPanel } from "./ResearchPanel.tsx";
import { WorldPanel } from "./WorldPanel.tsx";
import { TradePanel } from "./TradePanel.tsx";
import { Icon, MenuHead, TABS } from "./MenuHead.tsx";

const BUILD_MENUS = ["structure", "furniture", "production", "power", "water", "defense", "floor"];
/** Orders in groups, so the menu reads by what the order does. */
const ORDER_GROUPS: [string, readonly string[]][] = [
  ["take_apart", ["salvage", "deconstruct", "unfloor", "unline"]],
  ["dig", ["mine", "clear", "cut"]],
  ["ruins", ["claim", "pry"]],
  ["other", ["put_down", "haul"]],
];
const CROPS = ["glowcorn_plant", "scrub_potato_plant", "fiber_weed_plant", "ash_willow_plant"];
function costText(o: BuildOption) {
  return o.cost.map((c) => `${c.n} ${t(`item.${c.item}`)}`).join(", ");
}

/** One choice in a menu: a name and a short line under it. */
function Card({ testid, title, sub, onClick, disabled, cls }: { testid: string; title: string; sub: string; onClick: () => void; disabled?: boolean; cls?: string }) {
  return (
    <button class={`card ${cls ?? ""}`} data-testid={testid} disabled={disabled} onClick={onClick} title={sub}>
      <b>{title}</b>
      <small>{sub}</small>
    </button>
  );
}

export function Toolbar() {
  const s = useStore();
  const [buildTab, setBuildTab] = useState(BUILD_MENUS[0]);
  const pick = (spec: Parameters<typeof actions.setTool>[0]) => {
    actions.setTool(spec);
    store_close();
  };
  return (
    <>
      {s.menu === "build" && (
        <div class="menu buildmenu" data-testid="build-menu">
          <MenuHead id="build" />
          <div class="tabs" role="tablist">
            {BUILD_MENUS.map((m) => (
              <button key={m} role="tab" class={buildTab === m ? "on" : ""} data-testid={`build-tab-${m}`} onClick={() => setBuildTab(m)}>
                {t(`menu.${m}`)}
                <small>{s.buildOptions.filter((o) => o.menu === m && !o.locked).length}</small>
              </button>
            ))}
          </div>
          <div class="cards">
            {s.buildOptions
              .filter((o) => o.menu === buildTab)
              .map((o) => (
                <Card
                  key={o.def}
                  testid={`build-${o.def}`}
                  disabled={!!o.locked}
                  cls={o.locked ? "locked" : ""}
                  onClick={() => pick({ kind: "build", defKind: o.defKind, def: o.def })}
                  title={t(o.defKind === "floor" ? `floor.${o.def}` : `thing.${o.def}`)}
                  sub={o.locked ? t("build.locked", { project: t(`research.${o.locked}`) }) : costText(o)}
                />
              ))}
          </div>
        </div>
      )}
      {s.menu === "orders" && (
        <div class="menu ordersmenu" data-testid="orders-menu">
          <MenuHead id="orders" />
          {ORDER_GROUPS.map(([g, list]) => (
            <section key={g}>
              <h3>{t(`orders.group.${g}`)}</h3>
              <div class="cards">
                {list.map((o) =>
                  o === "haul" ? (
                    <Card key={o} testid="order-haul" onClick={() => pick({ kind: "haul" })} title={t("order.haul")} sub={t("order.haul.desc")} />
                  ) : (
                    <Card key={o} testid={`order-${o}`} onClick={() => pick({ kind: "order", desig: o as never })} title={t(`order.${o}`)} sub={t(`order.${o}.desc`)} />
                  ),
                )}
              </div>
            </section>
          ))}
          <div class="cards foot">
            <Card testid="order-cancel" cls="cancel" onClick={() => pick({ kind: "cancel" })} title={t("order.cancel")} sub={t("order.cancel.desc")} />
          </div>
        </div>
      )}
      {s.menu === "zones" && (
        <div class="menu zonesmenu" data-testid="zones-menu">
          <MenuHead id="zones" />
          <section>
            <h3>{t("zones.group.storage")}</h3>
            <div class="cards">
              <Card testid="zone-stockpile" onClick={() => pick({ kind: "zone", zone: "stockpile" })} title={t("zone.stockpile")} sub={t("zone.stockpile.desc")} />
            </div>
          </section>
          <section>
            <h3>{t("zones.group.fields")}</h3>
            <div class="cards">
              {CROPS.map((c) => (
                <Card key={c} testid={`zone-grow-${c}`} onClick={() => pick({ kind: "zone", zone: "grow", crop: c })} title={t("zone.grow", { crop: t(`thing.${c}`) })} sub={t(`thing.${c}.desc`)} />
              ))}
            </div>
          </section>
          <div class="cards foot">
            <Card testid="zone-remove" cls="cancel" onClick={() => pick({ kind: "zone", zone: "remove" })} title={t("zone.remove")} sub={t("zone.remove.desc")} />
          </div>
        </div>
      )}
      {s.menu === "work" && <WorkGrid />}
      {s.menu === "research" && <ResearchPanel />}
      {s.menu === "world" && <WorldPanel />}
      {s.menu === "trade" && s.caravan && <TradePanel />}
      {s.caravan && s.menu !== "trade" && (
        <div class="caravanbanner" data-testid="caravan-banner">
          <span>
            {t("fac." + s.caravan.faction)} · {t("trade.leaves", { h: s.caravan.hoursLeft })}
          </span>
          <button data-testid="open-trade" onClick={() => actions.openMenu("trade")}>
            {t("trade.open")}
          </button>
        </div>
      )}

      {s.toolLabel && (
        <div class="toolhint" data-testid="tool-hint">
          <span>{s.toolLabel}</span>
          {s.toolLabel.includes("⟳") && (
            <button onClick={() => actions.rotateTool(1)} aria-label={t("tool.rotate")} title={t("tool.rotate")}>
              ⟳
            </button>
          )}
          <button onClick={() => actions.setTool(null)}>{t("tool.done")}</button>
        </div>
      )}

      <nav class="toolbar" data-testid="toolbar">
        {TABS.map(({ id, key }) => (
          <button key={id} class={s.menu === id ? "on" : ""} data-testid={`tb-${id}`} onClick={() => actions.openMenu(id)} title={t(`tb.${id}.key`)} aria-keyshortcuts={key}>
            <Icon id={id} />
            <span class="tblabel">{t(`tb.${id}`)}</span>
            <kbd>{key}</kbd>
          </button>
        ))}
      </nav>
    </>
  );
}

function store_close() {
  actions.openMenu(null);
}
