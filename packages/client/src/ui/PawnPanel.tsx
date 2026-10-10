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
        {p.faction === "colony" ? (
          <>
            {t("pawn.age", { age: p.age })} · {p.downed ? t("pawn.downed") : t("pawn.doing", { job: t(p.job) })}
          </>
        ) : (
          t(`faction.${p.faction}`)
        )}
      </p>
      <p class="sub">{t("pawn.weapon", { weapon: p.weapon ? t(`item.${p.weapon}`) : t("pawn.fists") })}</p>
      <p class="sub" data-testid="pawn-armor">{p.armor.length ? t("pawn.armor", { list: p.armor.map((a) => t(`item.${a}`)).join(", ") }) : t("pawn.no_armor")}</p>
      {p.faction === "colony" && !p.downed && (
        <button class={`draft ${p.drafted ? "on" : ""}`} data-testid="draft" onClick={() => actions.toggleDraft(p.id)}>
          {p.drafted ? t("pawn.undraft") : t("pawn.draft")}
        </button>
      )}
      {p.drafted && <p class="hint">{t("pawn.draft_hint")}</p>}
      {p.faction === "raiders" && p.downed && (
        <button class={`draft ${p.capture ? "on" : ""}`} data-testid="capture" onClick={() => actions.setCapture(p.id, !p.capture)}>
          {t(p.capture ? "prison.cancel_capture" : "prison.capture")}
        </button>
      )}
      {p.faction === "prisoner" && (
        <>
          <p class="sub">{p.resistance > 0 ? t("prison.resistance", { n: Math.ceil(p.resistance) }) : t("prison.ready")}</p>
          <button class="draft" data-testid="release" onClick={() => actions.release(p.id)}>
            {t("prison.release")}
          </button>
        </>
      )}
      <h3>{t("pawn.health")}</h3>
      <Bar value={1 - p.bloodLoss} label={t("pawn.blood")} />
      <Bar value={1 - p.pain} label={t("pawn.pain")} />
      <ul class="injuries">
        {p.missing.map((m) => (
          <li key={`m-${m}`} class="neg">
            {t("pawn.missing", { part: t(`part.${m}`) })}
          </li>
        ))}
        {p.injuries.map((i, k) => (
          <li key={k}>
            <span>
              {t(`part.${i.part}`)}: {t(`injury.${i.kind}`)}
            </span>
            <span class={i.tended ? "pos" : "neg"}>{i.tended ? t("pawn.tended") : t("pawn.untended")}</span>
          </li>
        ))}
      </ul>
      {p.robot && <Bar value={p.charge} label={t("pawn.charge")} />}
      {p.faction !== "colony" || p.robot ? null : (
        <>
      <Bar value={p.mood / 100} label={t("pawn.mood")} />
      <h3>{t("pawn.needs")}</h3>
      {p.needs.map((n) => (
        <Bar key={n.id} value={n.value} label={t(`need.${n.id}`)} />
      ))}
      {p.rad > 0.01 && <Bar value={Math.max(0, 1 - p.rad)} label={t("pawn.rad")} />}
      <h3>{t("pawn.traits")}</h3>
      <ul class="traits">
        {p.traits.map((tr) => (
          <li key={tr} title={t(`trait.${tr}.desc`)}>
            {t(`trait.${tr}`)}
          </li>
        ))}
      </ul>
      {p.backstory.length > 0 && (
        <>
          <h3>{t("backstory.title")}</h3>
          <ul class="traits">
            {p.backstory.map((b) => (
              <li key={b} title={t(`backstory.${b}.desc`)}>
                {t(`backstory.${b}`)}
              </li>
            ))}
          </ul>
          {p.noWork.length > 0 && <p class="hint">{t("backstory.no_work", { list: p.noWork.map((w) => t(`work.${w}`)).join(", ") })}</p>}
        </>
      )}
      {p.relations.length > 0 && (
        <>
          <h3>{t("rel.title")}</h3>
          <ul class="thoughts" data-testid="relations">
            {p.relations.map((r) => (
              <li key={r.nick}>
                <span>
                  {r.nick} · {t(`rel.${r.label}`)}
                </span>
                <b class={r.opinion >= 0 ? "pos" : "neg"}>{r.opinion > 0 ? `+${r.opinion}` : r.opinion}</b>
              </li>
            ))}
          </ul>
        </>
      )}
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
        </>
      )}
    </aside>
  );
}
