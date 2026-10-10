import { t } from "@wc/data";
import { actions, useStore } from "./store.ts";

export function ResearchPanel() {
  const s = useStore();
  const tiers = [...new Set(s.research.map((r) => r.tier))].sort();
  return (
    <div class="menu researchmenu" data-testid="research-panel">
      <h3>{t("research.title")}</h3>
      <p class="hint">{s.research.some((r) => r.current) ? t("research.hint_busy") : t("research.hint")}</p>
      {tiers.map((tier) => (
        <section key={tier}>
          <h4>{t(`tier.${tier}`)}</h4>
          {s.research
            .filter((r) => r.tier === tier)
            .map((r) => (
              <button
                key={r.id}
                class={`proj ${r.state} ${r.current ? "on" : ""}`}
                data-testid={`research-${r.id}`}
                disabled={r.state !== "available"}
                onClick={() => actions.setResearch(r.current ? null : r.id)}
                title={t(`research.${r.id}.desc`)}
              >
                <b>{t(`research.${r.id}`)}</b>
                <span class="track">
                  <b style={{ width: `${Math.round(r.progress * 100)}%` }} />
                </span>
                <small>
                  {r.state === "done"
                    ? t("research.done")
                    : r.state === "locked"
                      ? t("research.locked", { needs: r.prereqs.map((p) => t(`research.${p}`)).join(", ") })
                      : r.state === "needs_blueprint"
                        ? t("research.needs_blueprint", { item: t(`item.${r.blueprint}`) })
                        : `${Math.round(r.progress * 100)}% · ${r.cost}`}
                </small>
                {r.blueprint && r.state !== "done" && <small class="where">{t(`where.${r.blueprint}`)}</small>}
              </button>
            ))}
        </section>
      ))}
    </div>
  );
}
