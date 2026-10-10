/**
 * String tables. All player-facing text goes through t().
 * Add a language by adding i18n/<code>.json with the same keys.
 */
import en from "../i18n/en.json";

const tables: Record<string, Record<string, string>> = { en };
let current: Record<string, string> = en;

export function setLanguage(code: string): void {
  current = tables[code] ?? en;
}

/** Add or replace English strings (mods). Keys a language table lacks fall back to these. */
export function addStrings(table: Record<string, string>): void {
  Object.assign(en, table);
}

/** Look up a key and fill {name} parameters. Missing keys show the key itself, so they are easy to spot. */
export function t(key: string, params: Record<string, string | number> = {}): string {
  const s = current[key] ?? en[key as keyof typeof en] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`));
}
