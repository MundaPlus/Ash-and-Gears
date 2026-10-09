/**
 * Content schemas. All game content is JSON that passes these schemas.
 * Mods use the same format (see docs/spec/10-tech-architecture.md, "Mod support").
 */
import { z } from "zod";

const id = z.string().regex(/^[a-z0-9_]+$/);
const color = z.string().regex(/^#[0-9a-f]{6}$/i);

export const TerrainDef = z.object({
  id,
  /** Placeholder color until real art exists. */
  color,
  /** Movement cost multiplier. 0 = cannot walk (solid or deep). */
  walkCost: z.number().min(0),
  /** 0 = no farming, 1 = normal soil, >1 = rich soil. */
  fertility: z.number().min(0).default(0),
  /** Solid terrain blocks movement and can be mined. */
  solid: z.boolean().default(false),
  /** Terrain left after mining a solid tile. */
  minedTo: id.optional(),
  /** Items dropped when mined. */
  mineYield: z.record(id, z.number().int().positive()).optional(),
  /** Water source quality when a survivor draws from it. */
  water: z.enum(["dirty", "clean", "toxic"]).optional(),
  /** Radiation per in-game hour while standing on it. */
  radiation: z.number().min(0).default(0),
  buildable: z.boolean().default(true),
});
export type TerrainDef = z.infer<typeof TerrainDef>;

export const ThingKind = z.enum(["structure", "plant", "furniture", "stairs", "item"]);

export const ThingDef = z.object({
  id,
  kind: ThingKind,
  color,
  /** Short label drawn on placeholder art. */
  glyph: z.string().max(2).default("?"),
  hp: z.number().int().positive().default(100),
  /** Blocks movement (walls, wrecks). */
  blocks: z.boolean().default(false),
  /** Counts as a wall for rooms. */
  wall: z.boolean().default(false),
  /** Items gained from salvage / deconstruct / harvest. */
  yield: z.record(id, z.number().int().positive()).optional(),
  /** Chance (0..1) of a loot roll when salvaged. */
  lootChance: z.number().min(0).max(1).default(0),
  /** Stairs link this layer offset: -1 = up, +1 = down. */
  stairs: z.number().int().optional(),
});
export type ThingDef = z.infer<typeof ThingDef>;

export const ItemDef = z.object({
  id,
  color,
  glyph: z.string().max(2).default("?"),
  stack: z.number().int().positive().default(75),
  category: z.enum(["resource", "food", "water", "medicine", "weapon", "apparel", "blueprint", "misc"]),
  /** Nutrition per unit (food). */
  nutrition: z.number().min(0).default(0),
  /** Hydration per unit (water). */
  hydration: z.number().min(0).default(0),
});
export type ItemDef = z.infer<typeof ItemDef>;

export const SkillDef = z.object({ id });
export type SkillDef = z.infer<typeof SkillDef>;

export const TraitDef = z.object({
  id,
  /** Flat mood offset. */
  mood: z.number().default(0),
  /** Work speed multiplier. */
  workSpeed: z.number().positive().default(1),
  /** Radiation dose multiplier. */
  radMult: z.number().min(0).default(1),
  skillBonus: z.record(id, z.number().int()).default({}),
  /** Free-form behavior flags that systems check, e.g. "night_owl". */
  flags: z.array(z.string()).default([]),
  conflicts: z.array(id).default([]),
});
export type TraitDef = z.infer<typeof TraitDef>;

export const ThoughtDef = z.object({
  id,
  mood: z.number(),
  /** In-game hours a memory lasts. Absent = situational (exists while the condition holds). */
  hours: z.number().positive().optional(),
  /** How many copies of a memory can stack. */
  stack: z.number().int().positive().default(1),
});
export type ThoughtDef = z.infer<typeof ThoughtDef>;

export const NameLists = z.object({
  first: z.array(z.string()).min(1),
  last: z.array(z.string()).min(1),
  nick: z.array(z.string()).min(1),
});
export type NameLists = z.infer<typeof NameLists>;

export const Content = z.object({
  terrain: z.array(TerrainDef),
  things: z.array(ThingDef),
  items: z.array(ItemDef),
  skills: z.array(SkillDef),
  traits: z.array(TraitDef),
  thoughts: z.array(ThoughtDef),
  names: NameLists,
});
export type Content = z.infer<typeof Content>;
