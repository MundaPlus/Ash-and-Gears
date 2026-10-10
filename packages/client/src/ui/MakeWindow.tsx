import { t } from "@wc/data";
import { actions } from "./store.ts";

/** Make window (user request): what this bench can make, and its queue of up to 5 orders. */
export function MakeWindow({ make, onClose }: { make: { benchId: number; queue: { recipe: string; left: number }[]; recipes: { id: string; inputs: string }[] }; onClose: () => void }) {
  const full = make.queue.length >= 5;
  return (
    <div class="makewin" role="dialog" aria-label={t("make.title")} data-testid="make-window">
      <header>
        <h3>{t("make.title")}</h3>
        <button class="close" onClick={onClose} aria-label={t("make.close")}>
          ×
        </button>
      </header>
      <p class="hint">{t("make.hint")}</p>
      <div class="recipes">
        {make.recipes.map((r) => {
          const canStack = make.queue[make.queue.length - 1]?.recipe === r.id;
          return (
            <button key={r.id} data-testid={`make-${r.id}`} disabled={full && !canStack} onClick={(e) => actions.queueAdd(make.benchId, r.id, e.shiftKey ? 5 : 1)}>
              <b>{t(`recipe.${r.id}`)}</b>
              <small>{r.inputs}</small>
            </button>
          );
        })}
      </div>
      <h4>
        {t("make.queue")} {make.queue.length}/5
      </h4>
      {make.queue.length === 0 && <p class="hint">{t("make.queue_empty")}</p>}
      <ol class="queue">
        {make.queue.map((o, i) => (
          <li key={i} data-testid={`queue-${i}`}>
            <span>{t(`recipe.${o.recipe}`)}</span>
            <button onClick={() => actions.queueSet(make.benchId, i, o.left - 1)} aria-label="-">
              −
            </button>
            <b class="num">{o.left}</b>
            <button onClick={() => actions.queueSet(make.benchId, i, o.left + 1)} aria-label="+">
              +
            </button>
            <button disabled={i === 0} onClick={() => actions.queueUp(make.benchId, i)} aria-label="↑">
              ↑
            </button>
            <button onClick={() => actions.queueSet(make.benchId, i, 0)} aria-label="×">
              ×
            </button>
          </li>
        ))}
      </ol>
      {full && <p class="hint">{t("make.full")}</p>}
    </div>
  );
}
