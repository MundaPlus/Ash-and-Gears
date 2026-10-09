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
  /** Work ticks to mine (solid) or clear (rubble) at work speed 1. */
  work: z.number().int().positive().default(150),
  /** Rubble-like terrain: "clear" turns it into this terrain and drops clearYield. */
  clearTo: id.optional(),
  clearYield: z.record(id, z.number().int().positive()).optional(),
});
export type TerrainDef = z.infer<typeof TerrainDef>;

export const ThingKind = z.enum(["structure", "plant", "furniture", "stairs", "item"]);

/** How the player builds something. Absent = cannot be built (ruins, plants). */
export const BuildInfo = z.object({
  cost: z.record(id, z.number().int().positive()),
  /** Work ticks at work speed 1. */
  work: z.number().int().positive(),
  /** Build menu group. */
  menu: z.enum(["structure", "furniture", "production", "power", "defense", "floor"]),
  /** Research project that unlocks it (M6). */
  research: id.optional(),
});
export type BuildInfo = z.infer<typeof BuildInfo>;

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
  build: BuildInfo.optional(),
  /** Work ticks to salvage (ruins) or cut (plants) at work speed 1. */
  work: z.number().int().positive().default(100),
  /** Doors are walkable but close rooms. */
  door: z.boolean().default(false),
  /** 0..1. How well a wall or door keeps heat in. */
  insulation: z.number().min(0).max(1).default(0.5),
  beauty: z.number().default(0),
  /** Beds: rest gain multiplier. */
  bed: z.object({ efficiency: z.number().positive(), thought: id }).optional(),
  /** Heat output in degrees per in-game hour into its room. Negative cools. */
  heat: z.number().default(0),
  /** Light radius in tiles. */
  light: z.number().min(0).default(0),
  /** Seats and tables raise comfort while eating (M4). */
  seat: z.boolean().default(false),
  table: z.boolean().default(false),
  /** Growing plant (crops). */
  crop: z
    .object({
      growDays: z.number().positive(),
      yield: z.record(id, z.number().int().positive()),
      /** No growth below this temperature. */
      minTemp: z.number().default(4),
    })
    .optional(),
  /** Water source a survivor can drink from or fill jugs at. */
  water: z.enum(["dirty", "clean", "toxic"]).optional(),
  /** Collects rain into clean water items (per in-game hour of rain). */
  rainCollect: z.number().int().min(0).default(0),
  /** Recipes are done at this thing (benches, stoves, wells). */
  bench: z.boolean().default(false),
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
  /** Raw food: cooking input, mood penalty when eaten raw. */
  raw: z.boolean().default(false),
  /** Days until it rots at full rate (warm). Absent = never rots. */
  rotDays: z.number().positive().optional(),
  /** Thought when eaten. */
  eatThought: id.optional(),
  /** Hydration per unit (water). */
  hydration: z.number().min(0).default(0),
});
export type ItemDef = z.infer<typeof ItemDef>;

export const FloorDef = z.object({
  id,
  color,
  build: BuildInfo,
  beauty: z.number().default(0),
  /** Replaces the terrain walk cost while the floor exists. */
  walkCost: z.number().positive().default(0.9),
});
export type FloorDef = z.infer<typeof FloorDef>;

export const RecipeDef = z.object({
  id,
  /** Things where this recipe can be done. */
  benches: z.array(id).min(1),
  /** Inputs by item id, or by tag "raw_food". */
  inputs: z.array(z.object({ item: id.optional(), tag: z.enum(["raw_food"]).optional(), count: z.number().int().positive() })),
  output: z.record(id, z.number().int().positive()),
  work: z.number().int().positive(),
  skill: id.optional(),
  /** Default "keep this many in stock" target. "per_colonist" multiplies by colony size. */
  target: z.number().int().min(0),
  perColonist: z.boolean().default(false),
  research: id.optional(),
});
export type RecipeDef = z.infer<typeof RecipeDef>;

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
  floors: z.array(FloorDef),
  recipes: z.array(RecipeDef),
  skills: z.array(SkillDef),
  traits: z.array(TraitDef),
  thoughts: z.array(ThoughtDef),
  names: NameLists,
  /** Loot table for salvage rolls: item id -> [min, max]. */
  loot: z.record(id, z.tuple([z.number().int().min(0), z.number().int().positive()])),
});
export type Content = z.infer<typeof Content>;
