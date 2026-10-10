import { Content } from "./schema.ts";
import terrain from "../content/core/terrain.json";
import things from "../content/core/things.json";
import items from "../content/core/items.json";
import skills from "../content/core/skills.json";
import traits from "../content/core/traits.json";
import backstories from "../content/core/backstories.json";
import thoughts from "../content/core/thoughts.json";
import names from "../content/core/names.json";
import floors from "../content/core/floors.json";
import loot from "../content/core/loot.json";
import recipes from "../content/core/recipes.json";
import creatures from "../content/core/creatures.json";
import research from "../content/core/research.json";

export * from "./schema.ts";

/** Load and validate the core content. Throws with a readable message on bad data. */
export function loadCoreContent(): Content {
  return Content.parse({ terrain, things, items, floors, recipes, creatures, research, skills, traits, backstories, thoughts, names, loot });
}
export * from "./i18n.ts";
export * from "./art/index.ts";
