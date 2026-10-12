/**
 * Tutorial panel (user request: guided play for new players). Shows the current step, why it matters
 * and what to do, and makes the button to press pulse. The sim decides when a step is done.
 */
import { t } from "@wc/data";
import { useEffect, useState } from "preact/hooks";
import { clearMark } from "../session.ts";
import { actions, useStore, type AlertUi } from "./store.ts";

const HL = "tut-hl";

/** Pulse the deepest element of the list that is on the page now (a menu item once its menu is open). */
function highlight(ids: string[]) {
  for (const el of document.querySelectorAll(`.${HL}`)) el.classList.remove(HL);
  for (let i = ids.length - 1; i >= 0; i--) {
    const el = document.querySelector(`[data-testid="${ids[i]}"]`);
    if (el) {
      el.classList.add(HL);
      return;
    }
  }
}

export function TutorialPanel({ alerts }: { alerts: AlertUi[] }) {
  const s = useStore();
  const tu = s.tutorial!;
  const [hidden, setHidden] = useState(false);
  useEffect(() => highlight(hidden || tu.passed ? [] : tu.highlight));
  useEffect(() => () => highlight([]), []);
  if (hidden)
    return (
      <button class="tutchip" data-testid="tutorial-show" onClick={() => setHidden(false)}>
        {t("tut.show")} · {tu.n}/{tu.total}
      </button>
    );
  const done = tu.id === "done";
  return (
    <aside class={`tutorial${tu.passed ? " passed" : ""}${s.menu ? " menuopen" : ""}`} data-testid="tutorial" data-step={tu.id}>
      <div class="tuthead">
        <span>{done ? t("tut.title") : t("tut.progress", { n: tu.n, total: tu.total })}</span>
        <button class="close" onClick={() => setHidden(true)} aria-label={t("tut.hide")} title={t("tut.hide")}>
          ×
        </button>
      </div>
      <div class="tutbar">
        <b style={{ width: `${Math.round(((tu.n - (tu.passed || done ? 0 : 1)) / tu.total) * 100)}%` }} />
      </div>
      <h3>{t(`tut.${tu.id}.title`)}</h3>
      <p class="why">{t(`tut.${tu.id}.why`)}</p>
      <p class="do" data-testid="tutorial-do">
        {tu.passed ? <b class="ok">✔ {t("tut.passed")}</b> : t(tu.hint)}
      </p>
      <div class="row">
        {done ? (
          <button
            onClick={() => {
              clearMark();
              location.search = "";
            }}
          >
            {t("ending.menu")}
          </button>
        ) : (
          <>
            <button data-testid="tutorial-skip" onClick={actions.tutorialSkip} disabled={tu.passed}>
              {t("tut.skip")}
            </button>
            <button data-testid="tutorial-end" onClick={actions.tutorialEnd}>
              {t("tut.end")}
            </button>
          </>
        )}
      </div>
      {alerts.length > 0 && (
        <div class="alerts" data-testid="alerts">
          {alerts.map((a) => (
            <button key={a.key} class={`alert ${a.level}`} disabled={!a.at} onClick={() => a.at && actions.jumpTo(a.at)}>
              {t(a.key, a.params)}
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}
