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
  menu: z.enum(["structure", "furniture", "production", "power", "water", "defense", "floor"]),
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
  /** 0..1 chance to block a shot at a pawn standing next to it (sandbags, wrecks). */
  cover: z.number().min(0).max(1).default(0),
  /** Blocks line of sight (walls). Defaults to blocks && wall. */
  blocksSight: z.boolean().optional(),
  /** Catches fire. */
  flammable: z.boolean().default(false),
  /** Power: produce (W), use (W), store (Wh), fuel (item burned per in-game hour at full output). */
  power: z
    .object({
      produce: z.number().min(0).default(0),
      use: z.number().min(0).default(0),
      store: z.number().min(0).default(0),
      fuel: z.object({ item: id, perHour: z.number().positive(), capacity: z.number().int().positive() }).optional(),
      /** Output follows the sun (day, weather) or the wind (A3). */
      source: z.enum(["solar", "wind"]).optional(),
      /** Consumers: 1 = keep on longest, 3 = cut first when power runs short (A3). */
      priority: z.number().int().min(1).max(3).default(2),
    })
    .optional(),
  /** Wires: carry power, nothing else. */
  conduit: z.boolean().default(false),
  /** Power pole: links to other poles up to this many tiles away (A3). */
  pole: z.number().positive().optional(),
  /** Power switch: a wire piece that carries power only while on (A3). */
  switch: z.boolean().default(false),
  /** Conveyor belt: moves items one tile toward its facing. Value = tiles per in-game hour. */
  belt: z.number().positive().optional(),
  /**
   * Belt kinds: "split" sends packets in turn to front, left and right; "sort" sends its filter item
   * forward and the rest to the right; "tunnel_in" sends packets under the ground to the next
   * "tunnel_out" with the same facing, at most TUNNEL_REACH tiles ahead.
   */
  beltKind: z.enum(["split", "sort", "tunnel_in", "tunnel_out"]).optional(),
  /** Loader: moves items from the tile behind it to the tile in front of it. */
  loader: z.boolean().default(false),
  /** Robot arm: a loader that can be set to move only one item. */
  arm: z.boolean().default(false),
  /** Pipe: carries fluids between fluid things that touch it (spec 12, A2). */
  pipe: z.boolean().default(false),
  /**
   * Fluid role (A2). pump: rate L/h from a water tile next to it (needs power); tank: holds capacity L;
   * purifier: rate L/h of water from its input side to clean water on its output side (needs power);
   * tap: survivors drink clean water from its network; still: a bench whose fuel bills fill its network.
   */
  fluid: z
    .object({
      role: z.enum(["pump", "tank", "purifier", "tap", "still"]),
      rate: z.number().positive().optional(),
      capacity: z.number().positive().optional(),
    })
    .optional(),
  /** Storage chest: holds up to this many items of any kind. Belts and arms fill and empty it. */
  chest: z.number().int().positive().optional(),
  /** Auto-crafter: runs a recipe without a survivor while powered. */
  autoCrafter: z.boolean().default(false),
  /** Work speed multiplier for bills done here (when powered, if it uses power). */
  benchSpeed: z.number().positive().default(1),
  /** Can be rotated when placed (belts, loaders, crafters). */
  rotatable: z.boolean().default(false),
  /** Tiles covered [width, height] with no rotation. The thing's x,y is the top-left tile. Rotation 1 or 3 swaps them. */
  footprint: z.tuple([z.number().int().min(1).max(4), z.number().int().min(1).max(4)]).default([1, 1]),
  /** Research desk: survivors research here. */
  research: z.number().positive().optional(),
  /** Turret: shoots hostiles on its own. */
  turret: z.object({ dmg: z.number(), range: z.number(), cooldown: z.number().int(), accuracy: z.number(), kind: z.string() }).optional(),
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
  /** Weapons: one melee or ranged attack. */
  weapon: z
    .object({
      dmg: z.number().positive(),
      /** Ticks between attacks. */
      cooldown: z.number().int().positive(),
      /** Tiles. 1.5 = melee. */
      range: z.number().positive(),
      /** Added to hit chance (ranged) */
      accuracy: z.number().default(0),
      kind: z.enum(["cut", "blunt", "gunshot", "arrow", "bite", "burn"]),
    })
    .optional(),
  /** Medicine: wound tending quality. */
  medicine: z.number().min(0).max(1).optional(),
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
  /** Fluid made instead of (or with) items: liters go into the bench's pipe network (A2). */
  fluidOut: z.object({ kind: z.enum(["fuel"]), liters: z.number().positive() }).optional(),
  work: z.number().int().positive(),
  skill: id.optional(),
  /** Default "keep this many in stock" target. "per_colonist" multiplies by colony size. */
  target: z.number().int().min(0),
  perColonist: z.boolean().default(false),
  research: id.optional(),
});
export type RecipeDef = z.infer<typeof RecipeDef>;

export const CreatureDef = z.object({
  id,
  color,
  glyph: z.string().max(2).default("?"),
  /** Sprite scale relative to a survivor. */
  size: z.number().positive().default(1),
  /** Body hit points multiplier. */
  hp: z.number().positive().default(1),
  speed: z.number().positive().default(1),
  /** Natural attack (bite, claws). Humans use weapons or fists. */
  attack: z.object({ dmg: z.number(), cooldown: z.number().int(), range: z.number(), accuracy: z.number().default(0), kind: z.string() }),
  behavior: z.enum(["human", "food_swarm", "hunter"]),
  /** Meat dropped when killed. */
  meat: z.number().int().min(0).default(0),
});
export type CreatureDef = z.infer<typeof CreatureDef>;

export const ResearchDef = z.object({
  id,
  /** Research points (one survivor at skill 10 makes about 1 point per tick). */
  cost: z.number().int().positive(),
  prereqs: z.array(id).default([]),
  /** Item that must be in stock to start (a salvaged blueprint). */
  blueprint: id.optional(),
  tier: z.number().int().min(0).max(4),
});
export type ResearchDef = z.infer<typeof ResearchDef>;

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
  creatures: z.array(CreatureDef),
  research: z.array(ResearchDef),
  skills: z.array(SkillDef),
  traits: z.array(TraitDef),
  thoughts: z.array(ThoughtDef),
  names: NameLists,
  /** Loot table for salvage rolls: item id -> [min, max]. */
  loot: z.record(id, z.tuple([z.number().int().min(0), z.number().int().positive()])),
});
export type Content = z.infer<typeof Content>;
