import { actions, useStore } from "./store.ts";

export function Toasts() {
  const { toasts } = useStore();
  return (
    <div class="toasts" aria-live="polite">
      {toasts.map((m) =>
        m.at ? (
          <button key={m.id} class={`toast ${m.level} jump`} onClick={() => actions.jumpTo(m.at!)}>
            {m.text}
          </button>
        ) : (
          <p key={m.id} class={`toast ${m.level}`}>
            {m.text}
          </p>
        ),
      )}
    </div>
  );
}
