import { t } from "@wc/data";
import { useState } from "preact/hooks";
import { actions, useStore, type PawnDetail } from "./store.ts";

const pct = (v: number) => `${Math.round(v * 100)}%`;
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

type SlotId = "head" | "body" | "weapon";

/** One gear slot: what sits there, its main number, and Drop (or Allow gear when kept empty). */
function Slot({ p, slot, item, note }: { p: PawnDetail; slot: SlotId; item: string | null; note: string }) {
  const own = p.faction === "colony" && !p.robot;
  const held = p.stats.held.includes(slot);
  return (
    <div class={`slot ${item ? "" : "empty"}`} data-testid={`slot-${slot}`}>
      <small>{t(`gear.slot.${slot}`)}</small>
      <b>{item ? t(`item.${item}`) : t(slot === "weapon" ? "pawn.fists" : "gear.empty")}</b>
      <em>{held && !item ? t("gear.kept_empty") : note}</em>
      {own && item && (
        <button class="slotbtn" data-testid={`drop-${slot}`} title={t("gear.drop_hint")} onClick={() => actions.dropGear(p.id, slot)}>
          {t("gear.drop")}
        </button>
      )}
      {own && !item && held && (
        <button class="slotbtn" data-testid={`allow-${slot}`} title={t("gear.allow_hint")} onClick={() => actions.holdGear(p.id, slot, false)}>
          {t("gear.allow")}
        </button>
      )}
    </div>
  );
}

/** Gear tab (user request): slots and the detailed stats they give. */
function GearTab({ p }: { p: PawnDetail }) {
  const s = p.stats;
  const a = s.attack;
  const headAvg = avg(s.protection.map((x) => x.head)), bodyAvg = avg(s.protection.map((x) => x.body));
  return (
    <div class="gear" data-testid="gear-tab">
      <div class="doll">
        <Slot p={p} slot="head" item={s.slots.head} note={s.slots.head ? t("gear.protects", { v: pct(headAvg) }) : ""} />
        <Slot p={p} slot="body" item={s.slots.body} note={s.slots.body ? t("gear.protects", { v: pct(bodyAvg) }) : ""} />
        <Slot p={p} slot="weapon" item={s.slots.weapon} note={t("gear.weapon_note", { dmg: a.dmg, kind: t(`dmg.${a.kind}`) })} />
      </div>
      <h3>{t("gear.combat")}</h3>
      <ul class="statlist">
        <li><span>{t("gear.style")}</span><b>{t(a.melee ? "gear.melee" : "gear.ranged")}</b></li>
        <li><span>{t("gear.damage")}</span><b>{a.dmg} {t(`dmg.${a.kind}`)}</b></li>
        {!a.melee && <li><span>{t("gear.range")}</span><b>{t("gear.tiles", { n: Math.round(a.range) })}</b></li>}
        <li title={a.melee ? "" : t("gear.hit_hint")}><span>{t("gear.hit")}</span><b>{pct(a.hit)}</b></li>
        <li><span>{t("gear.dps")}</span><b>{a.perSecond.toFixed(1)}</b></li>
      </ul>
      <h3>{t("gear.protection")}</h3>
      <table class="prot" data-testid="gear-protection">
        <thead><tr><th /><th>{t("gear.slot.head")}</th><th>{t("gear.slot.body")}</th></tr></thead>
        <tbody>
          {s.protection.map((x) => (
            <tr key={x.kind}><td>{t(`dmg.${x.kind}`)}</td><td class={x.head ? "" : "dim"}>{pct(x.head)}</td><td class={x.body ? "" : "dim"}>{pct(x.body)}</td></tr>
          ))}
        </tbody>
      </table>
      <p class="hint">{t("gear.legs_hint")}</p>
      <h3>{t("gear.body")}</h3>
      <ul class="statlist">
        <li><span>{t("gear.move")}</span><b class={s.move < 0.95 ? "neg" : ""}>{pct(s.move)}</b></li>
        {s.armorMove < 1 && <li><span>{t("gear.armor_move")}</span><b class="neg">{pct(s.armorMove)}</b></li>}
        <li><span>{t("gear.work")}</span><b class={s.work < 0.95 ? "neg" : s.work > 1.05 ? "pos" : ""}>{pct(s.work)}</b></li>
        <li><span>{t("gear.moving")}</span><b class={s.moving < 0.95 ? "neg" : ""}>{pct(s.moving)}</b></li>
        <li><span>{t("gear.manipulation")}</span><b class={s.manipulation < 0.95 ? "neg" : ""}>{pct(s.manipulation)}</b></li>
        <li><span>{t("gear.pain")}</span><b class={s.pain > 0.1 ? "neg" : ""}>{pct(s.pain)}</b></li>
      </ul>
    </div>
  );
}

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
  const [tab, setTab] = useState<"overview" | "gear">("overview");
  if (!p) return null;
  return (
    <aside class="inspect pawnpanel" data-testid="pawn-panel">
      <button class="close" onClick={actions.closeInspect} aria-label={t("ui.close")}>
        ×
      </button>
      <h2>
        <i class="swatch" style={{ background: p.color }} /> {p.name}
      </h2>
      <div class="tabs" data-testid="pawn-tabs">
        <button class={tab === "overview" ? "on" : ""} onClick={() => setTab("overview")}>{t("pawn.tab.overview")}</button>
        <button class={tab === "gear" ? "on" : ""} data-testid="tab-gear" onClick={() => setTab("gear")}>{t("pawn.tab.gear")}</button>
      </div>
      {tab === "gear" ? <GearTab p={p} /> : <>
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
          <li key={sk.id} title={[sk.passion ? t(`passion.${sk.passion}`) : "", t("pawn.skill_next", { pct: Math.floor(sk.next * 100) })].filter(Boolean).join(" · ")}>
            <span>
              {t(`skill.${sk.id}`)} <em class="passion">{sk.passion === 2 ? "++" : sk.passion === 1 ? "+" : ""}</em>
            </span>
            <span class="track">
              <b style={{ width: `${(sk.level / 20) * 100}%` }} />
              <i class="xp" style={{ width: `${sk.next * 100}%` }} />
            </span>
            <span class="num">{sk.level}</span>
          </li>
        ))}
      </ul>
        </>
      )}
      </>}
    </aside>
  );
}
