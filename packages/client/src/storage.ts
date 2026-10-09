/** Save slots in IndexedDB (spec 10 "Saves"). Every call fails soft: no storage means no saves, not a crash. */

export interface SlotInfo {
  id: string;
  name: string;
  savedAt: string;
  day: number;
  colonists: number;
  seed: string;
}

interface SlotRecord extends SlotInfo {
  bytes: Uint8Array;
}

const DB = "wasteland-colony";
const STORE = "saves";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const r = fn(db.transaction(STORE, mode).objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function writeSlot(info: SlotInfo, bytes: Uint8Array): Promise<void> {
  await tx("readwrite", (s) => s.put({ ...info, bytes } satisfies SlotRecord));
}

export async function readSlot(id: string): Promise<Uint8Array | null> {
  const r = (await tx("readonly", (s) => s.get(id))) as SlotRecord | undefined;
  return r?.bytes ?? null;
}

export async function listSlots(): Promise<SlotInfo[]> {
  try {
    const all = (await tx("readonly", (s) => s.getAll())) as SlotRecord[];
    return all.map(({ bytes: _b, ...info }) => info).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  } catch {
    return [];
  }
}

export async function deleteSlot(id: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(id));
}
