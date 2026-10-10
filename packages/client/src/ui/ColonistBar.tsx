import { t } from "@wc/data";
import { actions, useStore } from "./store.ts";

export function ColonistBar() {
  const s = useStore();
  return (
    <nav class="colonists" data-testid="colonists">
      {s.colonists.map((c) =>
        c.charge !== undefined ? (
          // Robots: a small chip with the name and a charge bar (red, yellow, green).
          <button
            key={c.id}
            class={`colonist robot ${s.pawn?.id === c.id ? "sel" : ""}`}
            onClick={() => actions.selectPawn(c.id, true)}
            title={`${c.nick} · ${t("pawn.charge")} ${Math.round(c.charge * 100)}% · ${t(c.job)}`}
          >
            <span class="nick">{c.nick}</span>
            <span class="mood">
              <b
                style={{
                  width: `${Math.round(c.charge * 100)}%`,
                  background: c.charge < 0.25 ? "#d9472e" : c.charge < 0.6 ? "#e3c25a" : "#9fd14a",
                }}
              />
            </span>
          </button>
        ) : (
          <button
            key={c.id}
            class={`colonist ${s.pawn?.id === c.id ? "sel" : ""}`}
            onClick={() => actions.selectPawn(c.id, true)}
            title={`${c.nick} · ${t(c.job)}`}
          >
            <i class="swatch" style={{ background: c.color }} />
            <span class="nick">{c.nick}</span>
            <span class="mood" aria-label={t("pawn.mood")}>
              <b
                style={{
                  width: `${c.mood}%`,
                  background: c.mood < 35 ? "var(--bad)" : c.mood < 50 ? "var(--warn)" : "var(--good)",
                }}
              />
            </span>
            {c.warn && (
              <em class="warn">
                {t(c.warn === "downed" || c.warn === "drafted" || c.warn === "idle" ? `pawn.${c.warn}` : `thought.${c.warn}`)}
              </em>
            )}
          </button>
        ),
      )}
      <button
        class="colonist draftall"
        data-testid="draft-all"
        onClick={actions.draftAll}
        title={t("pawn.draft_all_hint")}
      >
        {t("pawn.draft_all")}
      </button>
    </nav>
  );
}
