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
  /** Old floor (not built by the colony): "remove floor" turns it into this terrain and drops unfloorYield. */
  unfloorTo: id.optional(),
  unfloorYield: z.record(id, z.number().int().positive()).optional(),
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
  /** A locked old door (N1): blocks like a wall until survivors pry it open. */
  sealed: z.boolean().default(false),
  /** An old structure the colony can claim and patch up: it turns into this thing (owned, like built). */
  claimAs: id.optional(),
  /** Only made by claiming an old structure: never in the build menu. */
  claimed: z.boolean().default(false),
  /** Items gained from salvage / deconstruct / harvest. */
  yield: z.record(id, z.number().int().positive()).optional(),
  /** Chance (0..1) of a loot roll when salvaged. */
  lootChance: z.number().min(0).max(1).default(0),
  /** Always dropped when salvaged, item -> [min, max] (old-world lockers, A4). */
  drops: z.record(id, z.tuple([z.number().int().min(0), z.number().int().positive()])).optional(),
  /** Chance (0..1) to find a blueprint the colony still needs when salvaged (A4). */
  blueprintChance: z.number().min(0).max(1).default(0),
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
  /** Burns fuel without power (campfire): no fuel, no heat, light or cooking. Survivors refuel it. */
  burns: z.object({ item: id, perHour: z.number().positive(), capacity: z.number().int().positive(), whileWorking: z.boolean().default(false) }).optional(),
  /** Light radius in tiles. */
  light: z.number().min(0).default(0),
  /** Recreation (B9): fun per in-game hour and how many can relax here at once. */
  joy: z.object({ fun: z.number().positive(), seats: z.number().int().positive() }).optional(),
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
      /** Consumers: own backup battery (Wh). It fills from the network only and feeds only its machine. Absent = half an hour of use. */
      bank: z.number().min(0).optional(),
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
   * tap: survivors drink clean water from its network; machine: a bench on the pipes whose bills use or make fluids.
   */
  fluid: z
    .object({
      role: z.enum(["pump", "tank", "purifier", "tap", "machine"]),
      rate: z.number().positive().optional(),
      capacity: z.number().positive().optional(),
    })
    .optional(),
  /** Storage chest: holds up to this many items of any kind. Belts and arms fill and empty it. */
  chest: z.number().int().positive().optional(),
  /** A grave (B9): holds one corpse. Haulers bring corpses here; stockpiles and chests never take them. */
  grave: z.boolean().default(false),
  /** Auto-crafter: runs a recipe without a survivor while powered. */
  autoCrafter: z.boolean().default(false),
  /** Robot bay: robots charge and get repaired here while it has power (A7). */
  robotBay: z.boolean().default(false),
  /** Auto-crafter work speed multiplier (the assembler is faster, A4). */
  crafterSpeed: z.number().positive().default(1),
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
  category: z.enum(["resource", "food", "water", "medicine", "weapon", "apparel", "blueprint", "misc", "corpse"]),
  /** Nutrition per unit (food). */
  nutrition: z.number().min(0).default(0),
  /** Trade value per unit (A9). */
  value: z.number().min(0).default(1),
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
  /**
   * Armor (N2): worn on the body (torso and arms, half on the legs) or the head. Each value is the share
   * of that damage kind it stops (0..1). `move` slows the wearer (1 = no change).
   */
  armor: z
    .object({
      slot: z.enum(["body", "head"]),
      cut: z.number().min(0).max(0.9).default(0),
      blunt: z.number().min(0).max(0.9).default(0),
      gunshot: z.number().min(0).max(0.9).default(0),
      arrow: z.number().min(0).max(0.9).default(0),
      bite: z.number().min(0).max(0.9).default(0),
      burn: z.number().min(0).max(0.9).default(0),
      move: z.number().positive().max(1).default(1),
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
  /** A deck built over open air on a floor above the surface (N1). Needs a wall or a closed room below. */
  overAir: z.boolean().default(false),
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
  /** Makes a robot instead of items: the creature id of the new colony robot (A7). */
  spawn: id.optional(),
  /** Fluid used: liters taken from the bench's pipe network when the work starts (A4). */
  fluidIn: z.object({ kind: z.enum(["fuel", "water", "clean_water"]), liters: z.number().positive() }).optional(),
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
  /** Walking speed; 0 = cannot move (an old sentry gun). */
  speed: z.number().min(0).default(1),
  /** Natural attack (bite, claws). Humans use weapons or fists. */
  attack: z.object({ dmg: z.number(), cooldown: z.number().int(), range: z.number(), accuracy: z.number().default(0), kind: z.string() }),
  behavior: z.enum(["human", "food_swarm", "hunter", "machine"]),
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
  /** Walking speed multiplier (A5). */
  moveSpeed: z.number().positive().default(1),
  /** How fast hunger, thirst and rest go down (A5). */
  needMult: z.object({ hunger: z.number().positive().default(1), thirst: z.number().positive().default(1), rest: z.number().positive().default(1) }).default({ hunger: 1, thirst: 1, rest: 1 }),
  /** Pain multiplier: below 1 shrugs off wounds (A5). */
  painMult: z.number().min(0).default(1),
  /** How much good talks raise this survivor's opinions (A5). */
  opinionGain: z.number().min(0).default(1),
  /** How much others warm to this survivor in talks (A5). */
  likability: z.number().min(0).default(1),
});
export type TraitDef = z.infer<typeof TraitDef>;

/** Backstory (A5): one from before the war (childhood) and one from after (adulthood). */
export const BackstoryDef = z.object({
  id,
  stage: z.enum(["childhood", "adulthood"]),
  skillBonus: z.record(id, z.number().int()).default({}),
  /** Work types this survivor will not do. */
  workDisabled: z.array(z.string()).default([]),
});
export type BackstoryDef = z.infer<typeof BackstoryDef>;

/** Story (Beta B1): a condition that a beat's goal needs. */
export const StoryCondition = z.object({
  type: z.enum(["days", "beat_days", "research", "items", "built", "visited", "outpost", "flag", "people", "calm"]),
  id: z.string().optional(),
  n: z.number().optional(),
});
export type StoryCondition = z.infer<typeof StoryCondition>;

/** Story: something a beat does when it starts or ends. */
export const StoryEffect = z.object({
  type: z.enum(["message", "site", "robot", "items", "take", "flag", "raid", "goodwill", "win"]),
  id: z.string().optional(),
  key: z.string().optional(),
  level: z.enum(["info", "warn", "bad"]).optional(),
  kind: z.string().optional(),
  name: z.string().optional(),
  n: z.number().optional(),
  danger: z.number().optional(),
  dist: z.tuple([z.number(), z.number()]).optional(),
  items: z.record(id, z.number().int().positive()).optional(),
});
export type StoryEffect = z.infer<typeof StoryEffect>;

export const StoryDef = z.object({
  id,
  beats: z.array(
    z.object({
      id,
      start: z.array(StoryEffect).default([]),
      until: z.array(StoryCondition).min(1),
      done: z.array(StoryEffect).default([]),
    }),
  ),
});
export type StoryDef = z.infer<typeof StoryDef>;

/** A faction of the wasteland (A9). */
export const FactionDef = z.object({
  id,
  kind: z.enum(["raider", "trader", "cult"]),
  /** Goodwill toward the colony at the start, -100..100. */
  goodwill: z.number().min(-100).max(100),
  /** Weapons its raiders carry. */
  weapons: z.array(id).default([]),
  /** Traits its raiders have. */
  traits: z.array(id).default([]),
  /** Raid size multiplier. */
  raidSize: z.number().positive().default(1),
  /** What its traders sell: item -> [min, max] per caravan. */
  sells: z.record(id, z.tuple([z.number().int().min(0), z.number().int().positive()])).default({}),
});
export type FactionDef = z.infer<typeof FactionDef>;

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
  backstories: z.array(BackstoryDef),
  factions: z.array(FactionDef),
  story: z.array(StoryDef),
  thoughts: z.array(ThoughtDef),
  names: NameLists,
  /** Loot table for salvage rolls: item id -> [min, max]. */
  loot: z.record(id, z.tuple([z.number().int().min(0), z.number().int().positive()])),
});
export type Content = z.infer<typeof Content>;
