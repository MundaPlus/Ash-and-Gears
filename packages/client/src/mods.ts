/**
 * Installed mods (Beta B7), kept in local storage: the pack JSON and an on/off switch.
 * Mods load at boot, so a change takes effect with the next new game or load.
 */
export interface InstalledMod {
  id: string;
  name: string;
  version?: string;
  description?: string;
  enabled: boolean;
  pack: unknown;
}

const KEY = "wc-mods";

export function installedMods(): InstalledMod[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function save(list: InstalledMod[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // no storage: mods last only for this page
  }
}

/** Add a pack from a file's text. Returns an error key, or null when it worked. */
export function installMod(text: string): string | null {
  let pack: { id?: unknown; name?: unknown; version?: unknown; description?: unknown };
  try {
    pack = JSON.parse(text);
  } catch {
    return "mods.err_json";
  }
  if (typeof pack?.id !== "string" || typeof pack.name !== "string") return "mods.err_id";
  const list = installedMods().filter((m) => m.id !== pack.id);
  list.push({ id: pack.id, name: pack.name, version: typeof pack.version === "string" ? pack.version : undefined, description: typeof pack.description === "string" ? pack.description : undefined, enabled: true, pack });
  save(list);
  return null;
}

export function setModEnabled(id: string, on: boolean): void {
  save(installedMods().map((m) => (m.id === id ? { ...m, enabled: on } : m)));
}

export function removeMod(id: string): void {
  save(installedMods().filter((m) => m.id !== id));
}

/** Move a mod up in the load order (later mods win). */
export function raiseMod(id: string): void {
  const list = installedMods();
  const i = list.findIndex((m) => m.id === id);
  if (i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]];
  save(list);
}

export const enabledPacks = (): unknown[] => installedMods().filter((m) => m.enabled).map((m) => m.pack);

/** Errors from the last boot, by mod id (set in main.ts). */
export let modErrors: Record<string, string[]> = {};
export function setModErrors(e: Record<string, string[]>): void {
  modErrors = e;
}
