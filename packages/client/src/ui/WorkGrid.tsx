import { t } from "@wc/data";
import { useState } from "preact/hooks";
import { actions, useStore } from "./store.ts";

/** Click cycles 1 -> 2 -> 3 -> 4 -> off -> 1. Lower number = done first. */
const next = (v: number) => (v === 0 ? 1 : v === 4 ? 0 : v + 1);
const SKILL_FOR: Record<string, string> = { construct: "construction", grow: "farming", mine: "mining", salvage: "scavenging", cook: "cooking", craft: "crafting", research: "technology", doctor: "medicine" };

const SLOTS = ["any", "work", "sleep", "joy"];

/** Work menu: priorities and the daily schedule, as two tabs. */
export function WorkGrid() {
  const [tab, setTab] = useState<"prio" | "sched">("prio");
  return (
    <div class="menu workgrid" data-testid="work-grid">
      <div class="tabs">
        <button class={tab === "prio" ? "on" : ""} onClick={() => setTab("prio")}>
          {t("work.tab_priorities")}
        </button>
        <button class={tab === "sched" ? "on" : ""} data-testid="tab-schedule" onClick={() => setTab("sched")}>
          {t("work.tab_schedule")}
        </button>
      </div>
      {tab === "prio" ? <Priorities /> : <Schedule />}
    </div>
  );
}

/** Paint hours: pick a slot type, then click or drag over the cells. */
function Schedule() {
  const s = useStore();
  const [paint, setPaint] = useState("work");
  const [down, setDown] = useState(false);
  return (
    <div class="schedule" data-testid="schedule" onMouseUp={() => setDown(false)} onMouseLeave={() => setDown(false)}>
      <p class="hint">{t("sched.hint")}</p>
      <div class="slotpick">
        {SLOTS.map((k) => (
          <button key={k} class={`slot s-${k}${paint === k ? " picked" : ""}`} data-testid={`paint-${k}`} onClick={() => setPaint(k)}>
            {t(`sched.${k}`)}
          </button>
        ))}
      </div>
      <div class="scroll">
        <table>
          <thead>
            <tr>
              <th />
              {Array.from({ length: 24 }, (_, h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {s.workRows.filter((r) => !r.robot).map((r) => (
              <tr key={r.id}>
                <th>
                  <i class="swatch" style={{ background: r.color }} /> {r.nick}
                </th>
                {r.schedule.map((v, h) => (
                  <td
                    key={h}
                    class={`cell c-${v}`}
                    data-testid={`sched-${r.id}-${h}`}
                    title={t(`sched.${v}`)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setDown(true);
                      actions.setSchedule(r.id, h, paint);
                    }}
                    onMouseEnter={() => down && v !== paint && actions.setSchedule(r.id, h, paint)}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Priorities() {
  const s = useStore();
  return (
    <>
      <p class="hint">{t("work.hint")}</p>
      <div class="scroll">
        <table>
          <thead>
            <tr>
              <th />
              {s.workTypes.map((w) => (
                <th key={w}>{t(`work.${w}`)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {s.workRows.map((r) => (
              <tr key={r.id}>
                <th>
                  <i class="swatch" style={{ background: r.color }} /> {r.nick}
                </th>
                {s.workTypes.map((w) => {
                  const banned = r.noWork.includes(w);
                  const v = banned ? 0 : (r.work[w] ?? 3);
                  const skill = SKILL_FOR[w];
                  return (
                    <td key={w}>
                      <button
                        class={`prio p${v}${banned ? " banned" : ""}`}
                        data-testid={`work-${r.id}-${w}`}
                        disabled={banned}
                        onClick={() => actions.setWork(r.id, w, next(v))}
                        title={skill ? `${t(`skill.${skill}`)} ${r.skills[skill] ?? 0}` : ""}
                      >
                        {v === 0 ? "–" : v}
                        {skill && <small>{r.skills[skill] ?? 0}</small>}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
