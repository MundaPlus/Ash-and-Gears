import { Content } from "./schema.ts";
import terrain from "../content/core/terrain.json";
import things from "../content/core/things.json";
import items from "../content/core/items.json";
import skills from "../content/core/skills.json";
import traits from "../content/core/traits.json";
import thoughts from "../content/core/thoughts.json";
import names from "../content/core/names.json";

export * from "./schema.ts";

/** Load and validate the core content. Throws with a readable message on bad data. */
export function loadCoreContent(): Content {
  return Content.parse({ terrain, things, items, skills, traits, thoughts, names });
}
export * from "./i18n.ts";
