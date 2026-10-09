import { useStore } from "./store.ts";

export function Toasts() {
  const { toasts } = useStore();
  return (
    <div class="toasts" aria-live="polite">
      {toasts.map((m) => (
        <p key={m.id} class={`toast ${m.level}`}>
          {m.text}
        </p>
      ))}
    </div>
  );
}
