/**
 * Mods (Beta B7): content packs in the same JSON shape as the core content.
 * A pack adds entries to the content lists. An entry with the id of an existing entry replaces it.
 * A pack can also add strings (i18n) and 16 px art grids. Each pack is checked on its own:
 * a bad pack is left out and its errors are shown; the good packs still load.
 */
import { z } from "zod";
import { CREATURES, FLOORS, ITEMS, THINGS } from "./art/index.ts";
import { addStrings } from "./i18n.ts";
import { Content } from "./schema.ts";

const LISTS = ["terrain", "things", "items", "floors", "recipes", "creatures", "research", "traits", "backstories", "factions", "story", "thoughts"] as const;

const grid = z.array(z.string().regex(/^[0-9a-f.]{16}$/, "art rows are 16 characters of 0-9, a-f or .")).length(16);

export const ModPack = z.object({
  id: z.string().regex(/^[a-z0-9_-]+$/, "use lowercase letters, digits, _ or -"),
  name: z.string().min(1),
  version: z.string().optional(),
  author: z.string().optional(),
  description: z.string().optional(),
  ...Object.fromEntries(LISTS.map((k) => [k, z.array(z.record(z.string(), z.unknown())).optional()])),
  names: z.object({ first: z.array(z.string()).optional(), last: z.array(z.string()).optional(), nick: z.array(z.string()).optional() }).optional(),
  loot: z.record(z.string(), z.tuple([z.number().int().min(0), z.number().int().positive()])).optional(),
  /** Strings for t(): key -> English text. */
  i18n: z.record(z.string(), z.string()).optional(),
  /** Art grids by id, for things, items, creatures and floors. */
  art: z.object({ things: z.record(z.string(), grid).optional(), items: z.record(z.string(), grid).optional(), creatures: z.record(z.string(), grid).optional(), floors: z.record(z.string(), grid).optional() }).optional(),
});
export type ModPack = z.infer<typeof ModPack>;

export interface ModResult {
  content: Content;
  /** Pack id (or file name) -> readable errors. Packs with errors are left out. */
  errors: Record<string, string[]>;
  loaded: string[];
}

type Raw = Record<string, unknown> & { [K in (typeof LISTS)[number]]: { id: string }[] };

/** Readable errors: "recipes.bake_bread.target: ..." (the entry id instead of its list index). */
function issues(e: z.ZodError, data: Record<string, unknown>): string[] {
  return e.issues.slice(0, 5).map((i) => {
    const path = i.path.map((k, n) => {
      const list = n === 1 ? (data[String(i.path[0])] as { id?: string }[] | undefined) : undefined;
      return typeof k === "number" && Array.isArray(list) && list[k]?.id ? list[k].id : String(k);
    });
    return `${path.join(".") || "(pack)"}: ${i.message}`;
  });
}

/** Item, research and thing ids that recipes and things point to must exist. */
function refErrors(c: Content): string[] {
  const out: string[] = [];
  const items = new Set(c.items.map((x) => x.id)), research = new Set(c.research.map((x) => x.id)), things = new Set(c.things.map((x) => x.id));
  for (const r of c.recipes) {
    for (const i of r.inputs) if (i.item && !items.has(i.item)) out.push(`recipes.${r.id}: unknown item "${i.item}"`);
    for (const k of Object.keys(r.output ?? {})) if (!items.has(k)) out.push(`recipes.${r.id}: unknown item "${k}"`);
    for (const b of r.benches) if (!things.has(b)) out.push(`recipes.${r.id}: unknown bench "${b}"`);
    if (r.research && !research.has(r.research)) out.push(`recipes.${r.id}: unknown research "${r.research}"`);
  }
  for (const t of c.things) {
    for (const k of Object.keys(t.build?.cost ?? {})) if (!items.has(k)) out.push(`things.${t.id}: unknown item "${k}"`);
    if (t.build?.research && !research.has(t.build.research)) out.push(`things.${t.id}: unknown research "${t.build.research}"`);
  }
  for (const r of c.research) for (const p of r.prereqs ?? []) if (!research.has(p)) out.push(`research.${r.id}: unknown prerequisite "${p}"`);
  return out.slice(0, 5);
}

function merge(base: Raw, pack: ModPack): Raw {
  const out: Raw = { ...base };
  for (const k of LISTS) {
    const add = (pack as Record<string, unknown>)[k] as { id: string }[] | undefined;
    if (!add) continue;
    const list = [...base[k]];
    for (const e of add) {
      const i = list.findIndex((x) => x.id === e.id);
      if (i >= 0) list[i] = e;
      else list.push(e);
    }
    out[k] = list;
  }
  if (pack.names) {
    const n = base.names as Record<string, string[]>;
    out.names = { first: [...n.first, ...(pack.names.first ?? [])], last: [...n.last, ...(pack.names.last ?? [])], nick: [...n.nick, ...(pack.names.nick ?? [])] };
  }
  if (pack.loot) out.loot = { ...(base.loot as object), ...pack.loot };
  return out;
}

/** Apply packs in order on top of the core content. Bad packs are left out; see `errors`. */
export function applyMods(core: Content, packs: unknown[]): ModResult {
  let raw = structuredClone(core) as unknown as Raw;
  let content = core;
  const errors: Record<string, string[]> = {};
  const loaded: string[] = [];
  packs.forEach((p, n) => {
    const name = (p as { id?: string })?.id ?? `pack ${n + 1}`;
    const pack = ModPack.safeParse(p);
    if (!pack.success) {
      errors[name] = issues(pack.error, (p ?? {}) as Record<string, unknown>);
      return;
    }
    const next = merge(raw, pack.data);
    const parsed = Content.safeParse(next);
    if (!parsed.success) {
      errors[name] = issues(parsed.error, next);
      return;
    }
    const refs = refErrors(parsed.data);
    if (refs.length) {
      errors[name] = refs;
      return;
    }
    raw = next;
    content = parsed.data;
    loaded.push(pack.data.id);
    if (pack.data.i18n) addStrings(pack.data.i18n);
    const art = pack.data.art;
    if (art) {
      Object.assign(THINGS, art.things ?? {});
      Object.assign(ITEMS, art.items ?? {});
      Object.assign(CREATURES, art.creatures ?? {});
      Object.assign(FLOORS, art.floors ?? {});
    }
  });
  return { content, errors, loaded };
}
