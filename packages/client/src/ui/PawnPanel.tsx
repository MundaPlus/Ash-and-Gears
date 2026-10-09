import { t } from "@wc/data";
import { actions, useStore } from "./store.ts";

function Bar({ value, label }: { value: number; label: string }) {
  const pct = Math.round(value * 100);
  const color = value < 0.25 ? "var(--bad)" : value < 0.5 ? "var(--warn)" : "var(--good)";
  return (
    <div class="bar">
      <span>{label}</span>
      <span class="track">
        <b style={{ width: `${pct}%`, background: color }} />
      </span>
      <span class="num">{pct}%</span>
    </div>
  );
}

export function PawnPanel() {
  const { pawn: p } = useStore();
  if (!p) return null;
  return (
    <aside class="inspect pawnpanel" data-testid="pawn-panel">
      <button class="close" onClick={actions.closeInspect} aria-label={t("ui.close")}>
        ×
      </button>
      <h2>
        <i class="swatch" style={{ background: p.color }} /> {p.name}
      </h2>
      <p class="sub">
        {t("pawn.age", { age: p.age })} · {t("pawn.doing", { job: t(`job.${p.job}`) })}
      </p>
      <Bar value={p.mood / 100} label={t("pawn.mood")} />
      <h3>{t("pawn.needs")}</h3>
      {p.needs.map((n) => (
        <Bar key={n.id} value={n.value} label={t(`need.${n.id}`)} />
      ))}
      <h3>{t("pawn.traits")}</h3>
      <ul class="traits">
        {p.traits.map((tr) => (
          <li key={tr} title={t(`trait.${tr}.desc`)}>
            {t(`trait.${tr}`)}
          </li>
        ))}
      </ul>
      <h3>{t("pawn.thoughts")}</h3>
      <ul class="thoughts">
        {p.thoughts.map((th, i) => (
          <li key={i}>
            <span>{t(`thought.${th.id}`)}</span>
            <b class={th.mood >= 0 ? "pos" : "neg"}>{th.mood > 0 ? `+${th.mood}` : th.mood}</b>
          </li>
        ))}
      </ul>
      <h3>{t("pawn.skills")}</h3>
      <ul class="skills">
        {p.skills.map((sk) => (
          <li key={sk.id} title={sk.passion ? t(`passion.${sk.passion}`) : ""}>
            <span>
              {t(`skill.${sk.id}`)} <em class="passion">{sk.passion === 2 ? "++" : sk.passion === 1 ? "+" : ""}</em>
            </span>
            <span class="track">
              <b style={{ width: `${(sk.level / 20) * 100}%` }} />
            </span>
            <span class="num">{sk.level}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
