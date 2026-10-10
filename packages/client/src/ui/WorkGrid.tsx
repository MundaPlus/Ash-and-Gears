import { t } from "@wc/data";
import { actions, useStore } from "./store.ts";

/** Click cycles 1 -> 2 -> 3 -> 4 -> off -> 1. Lower number = done first. */
const next = (v: number) => (v === 0 ? 1 : v === 4 ? 0 : v + 1);
const SKILL_FOR: Record<string, string> = { construct: "construction", grow: "farming", mine: "mining", salvage: "scavenging", cook: "cooking", craft: "crafting", research: "technology", doctor: "medicine" };

export function WorkGrid() {
  const s = useStore();
  return (
    <div class="menu workgrid" data-testid="work-grid">
      <h3>{t("work.title")}</h3>
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
    </div>
  );
}
