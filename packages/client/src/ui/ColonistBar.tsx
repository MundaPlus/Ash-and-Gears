import { t } from "@wc/data";
import { actions, useStore } from "./store.ts";

export function ColonistBar() {
  const s = useStore();
  return (
    <nav class="colonists" data-testid="colonists">
      {s.colonists.map((c) => (
        <button
          key={c.id}
          class={`colonist ${s.pawn?.id === c.id ? "sel" : ""}`}
          onClick={() => actions.selectPawn(c.id, true)}
          title={`${c.nick} · ${t(c.job)}`}
        >
          <i class="swatch" style={{ background: c.color }} />
          <span class="nick">{c.nick}</span>
          <span class="mood" aria-label={t("pawn.mood")}>
            <b style={{ width: `${c.mood}%`, background: c.mood < 35 ? "var(--bad)" : c.mood < 50 ? "var(--warn)" : "var(--good)" }} />
          </span>
          {c.warn && <em class="warn">{t(`thought.${c.warn}`)}</em>}
        </button>
      ))}
    </nav>
  );
}
