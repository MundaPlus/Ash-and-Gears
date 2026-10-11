import { t } from "@wc/data";
import { actions, useStore, type Toast } from "./store.ts";

/** "Paused" tag on a message that paused the game. */
const Tag = ({ m }: { m: Toast }) => (m.pin ? <b class="pausetag">{t("toast.paused")}</b> : null);

export function Toasts() {
  const { toasts } = useStore();
  return (
    <div class="toasts" aria-live="polite">
      {toasts.map((m) =>
        m.at ? (
          <button key={m.id} class={`toast ${m.level} jump ${m.pin ? "pinned" : ""}`} data-testid={m.pin ? "pause-reason" : undefined} onClick={() => actions.jumpTo(m.at!)}>
            <Tag m={m} />
            {m.text}
          </button>
        ) : (
          <p key={m.id} class={`toast ${m.level} ${m.pin ? "pinned" : ""}`} data-testid={m.pin ? "pause-reason" : undefined}>
            <Tag m={m} />
            {m.text}
          </p>
        ),
      )}
    </div>
  );
}
