# Modding Ash & Gears

A mod is one `.json` file: a content pack. Add it in **Title screen → Mods** or **Menu → Settings → Mods**. Changes take effect with the next new game or load.

## Pack format

```json
{
  "id": "my-mod",
  "name": "My Mod",
  "version": "1.0",
  "author": "you",
  "description": "One line about the mod.",
  "items": [], "things": [], "recipes": [], "research": [], "creatures": [],
  "terrain": [], "floors": [], "traits": [], "backstories": [], "factions": [], "story": [], "thoughts": [],
  "names": { "first": [], "last": [], "nick": [] },
  "loot": { "steel": [1, 3] },
  "i18n": { "item.my_item": "My item" },
  "art": { "items": { "my_item": ["16 rows of 16 characters"] } }
}
```

- Every list uses the same shape as the core files in `packages/data/content/core/`.
- A new id adds an entry. A known id replaces the core entry.
- Mods load in list order. A later mod wins.
- `i18n` adds player text. Use the key patterns of `packages/data/i18n/en.json` (`item.<id>`, `thing.<id>`, `recipe.<id>`, `research.<id>`, `research.<id>.desc`, `line.<story id>`).
- `art` grids are 16 rows of 16 characters. `.` is clear. `0`–`f` are palette colors (0–7 neutral ramp, 8–a rust, b–c plants, d–e metal, f glow).
- The game checks each pack. A bad pack is left out. Its errors show in the mod list. Good packs still load.
- Saves store content ids. A save that uses a removed mod's things does not load.

## Example

`mods/wasteland-bakery.json` adds flatbread: one item, one recipe, strings and art.
