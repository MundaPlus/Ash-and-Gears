/**
 * Refresh keeps the game (user request). While a game runs, its state goes to the IndexedDB slot
 * "session" every few seconds and when the tab is hidden; a small marker in session storage says
 * which URL that state belongs to. A refresh of the same URL loads it. Session storage ends with
 * the tab, so a closed and reopened tab (or cleared browser data) starts fresh: no automatic load.
 */
const KEY = "wc-session";
export const SESSION_SLOT = "session";

export interface SessionMark {
  url: string;
  camera?: { x: number; y: number; zoom: number };
}

export function readMark(): SessionMark | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
    return v && typeof v.url === "string" ? v : null;
  } catch {
    return null;
  }
}

export function writeMark(m: SessionMark): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    // no session storage: a refresh starts the game again
  }
}

/** Forget the running game (a new game, a load, or the main menu). */
export function clearMark(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}
