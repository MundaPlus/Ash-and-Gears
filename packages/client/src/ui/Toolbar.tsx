import { t } from "@wc/data";
import { actions, useStore, type BuildOption } from "./store.ts";
import { WorkGrid } from "./WorkGrid.tsx";

const BUILD_MENUS = ["structure", "furniture", "production", "floor"];
const ORDERS = ["salvage", "mine", "clear", "cut"] as const;

function costText(o: BuildOption) {
  return o.cost.map((c) => `${c.n} ${t(`item.${c.item}`)}`).join(", ");
}

export function Toolbar() {
  const s = useStore();
  const pick = (spec: Parameters<typeof actions.setTool>[0]) => {
    actions.setTool(spec);
    store_close();
  };
  return (
    <>
      {s.menu === "build" && (
        <div class="menu buildmenu" data-testid="build-menu">
          {BUILD_MENUS.map((m) => (
            <section key={m}>
              <h3>{t(`menu.${m}`)}</h3>
              {s.buildOptions
                .filter((o) => o.menu === m)
                .map((o) => (
                  <button key={o.def} data-testid={`build-${o.def}`} onClick={() => pick({ kind: "build", defKind: o.defKind, def: o.def })} title={costText(o)}>
                    <b>{t(o.defKind === "floor" ? `floor.${o.def}` : `thing.${o.def}`)}</b>
                    <small>{costText(o)}</small>
                  </button>
                ))}
            </section>
          ))}
        </div>
      )}
      {s.menu === "orders" && (
        <div class="menu" data-testid="orders-menu">
          {ORDERS.map((o) => (
            <button key={o} data-testid={`order-${o}`} onClick={() => pick({ kind: "order", desig: o })}>
              <b>{t(`order.${o}`)}</b>
              <small>{t(`order.${o}.desc`)}</small>
            </button>
          ))}
          <button data-testid="order-cancel" onClick={() => pick({ kind: "cancel" })}>
            <b>{t("order.cancel")}</b>
            <small>{t("order.cancel.desc")}</small>
          </button>
        </div>
      )}
      {s.menu === "zones" && (
        <div class="menu" data-testid="zones-menu">
          <button data-testid="zone-stockpile" onClick={() => pick({ kind: "zone", zone: "stockpile" })}>
            <b>{t("zone.stockpile")}</b>
            <small>{t("zone.stockpile.desc")}</small>
          </button>
          {["glowcorn_plant", "scrub_potato_plant", "fiber_weed_plant"].map((c) => (
            <button key={c} data-testid={`zone-grow-${c}`} onClick={() => pick({ kind: "zone", zone: "grow", crop: c })}>
              <b>{t("zone.grow", { crop: t(`thing.${c}`) })}</b>
              <small>{t(`thing.${c}.desc`)}</small>
            </button>
          ))}
          <button data-testid="zone-remove" onClick={() => pick({ kind: "zone", zone: "remove" })}>
            <b>{t("zone.remove")}</b>
            <small>{t("zone.remove.desc")}</small>
          </button>
        </div>
      )}
      {s.menu === "work" && <WorkGrid />}

      {s.toolLabel && (
        <div class="toolhint" data-testid="tool-hint">
          <span>{s.toolLabel}</span>
          <button onClick={() => actions.setTool(null)}>{t("tool.done")}</button>
        </div>
      )}

      <nav class="toolbar" data-testid="toolbar">
        {(["build", "orders", "zones", "work"] as const).map((m) => (
          <button key={m} class={s.menu === m ? "on" : ""} data-testid={`tb-${m}`} onClick={() => actions.openMenu(m)}>
            {t(`tb.${m}`)}
          </button>
        ))}
      </nav>
    </>
  );
}

function store_close() {
  actions.openMenu(null);
}
