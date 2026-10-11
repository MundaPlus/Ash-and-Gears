/** The bottom bar's menus: their keys, icons, and the shared menu header. */
import { t } from "@wc/data";
import type { ComponentChildren, JSX } from "preact";
import { actions } from "./store.ts";

export type MenuId = "build" | "orders" | "zones" | "work" | "research" | "world";
/** The bottom bar: each menu, its key (also in main.ts MENU_KEYS) and its icon. */
export const TABS: { id: MenuId; key: string }[] = [
  { id: "build", key: "B" },
  { id: "orders", key: "O" },
  { id: "zones", key: "Z" },
  { id: "work", key: "J" },
  { id: "research", key: "T" },
  { id: "world", key: "M" },
];

/** Small line icons for the bottom bar (24 px grid, drawn in the text color). */
const ICONS: Record<MenuId, JSX.Element> = {
  // A brick wall.
  build: <path d="M3 6h18v12H3zM3 12h18M9 6v6M15 12v6M7 12v6" />,
  // A flag on a pole.
  orders: <path d="M6 21V4M6 4h11l-2 4 2 4H6" />,
  // A dashed square with a sprout.
  zones: <path d="M4 4h4M12 4h4M20 4v4M20 12v4M20 20h-4M12 20H8M4 20v-4M4 12V8M12 16v-5M12 11c0-2 2-3 4-3 0 2-2 3-4 3z" />,
  // A list with check boxes.
  work: <path d="M4 5h3v3H4zM4 11h3v3H4zM4 17h3v3H4zM10 6.5h10M10 12.5h10M10 18.5h10" />,
  // A flask.
  research: <path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M7.5 15h9" />,
  // A globe.
  world: <path d="M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />,
};

export function Icon({ id }: { id: MenuId }) {
  return (
    <svg class="tbicon" viewBox="0 0 24 24" aria-hidden="true">
      {ICONS[id]}
    </svg>
  );
}

/** The top of every bottom-bar menu: its name, its key, and a close button. */
export function MenuHead({ id, children }: { id: MenuId; children?: ComponentChildren }) {
  const key = TABS.find((x) => x.id === id)!.key;
  return (
    <header class="menuhead">
      <h2>{t(`tb.${id}`)}</h2>
      <kbd title={t("tb.key_hint")}>{key}</kbd>
      {children}
      <button class="close" aria-label={t("menu.close")} title={`${t("menu.close")} (Esc)`} onClick={() => actions.openMenu(null)}>
        ×
      </button>
    </header>
  );
}

