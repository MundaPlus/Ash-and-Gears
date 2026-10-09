# 03 — Building

## Orders (designations)

Player marks work. Survivors do it.

- Build (blueprint placed, materials hauled, then constructed).
- Deconstruct (own buildings: returns most materials).
- **Salvage** (ruins and wrecks: returns scrap, parts, random finds).
- Mine (rock, underground).
- Clear rubble.
- Cut plants / harvest.
- Haul, clean, hunt, tame (post-demo).
- Cancel.

## Structures

| Category | Examples |
|---|---|
| Walls | Scrap wall, wood wall, brick wall, concrete wall, reinforced wall |
| Doors | Curtain, scrap door, metal door, blast door (powered, late) |
| Floors | Dirt (none), wood planks, scrap tiles, concrete, sterile tiles |
| Roofs | Auto-added over enclosed rooms up to 6 tiles from a wall. Can be removed |
| Supports | Underground: wooden prop, steel beam. Prevents cave-ins |
| Stairs | Ladder, stairs, lift (powered) |

- Materials change HP, build time, beauty and insulation.
- Every structure has HP and can burn or break.

## Rooms

- A room is an area fully enclosed by walls and doors, with a roof.
- Found by flood fill. Recalculated when walls or doors change.
- Room types are auto-detected by contents: bedroom, barracks, kitchen, dining room, workshop, hospital, storage, lab, rec room, prison.
- Room stats: **size, beauty, cleanliness, temperature, air** (see radiation). Stats give room quality: Awful → Impressive. Quality gives mood thoughts.

## Temperature

- Each room has one temperature value. Outdoors uses the weather temperature.
- Heat moves through walls (insulation by material), open doors and between rooms.
- Heat sources: campfire, stove, heater (fuel or power), survivors (tiny), fires.
- Cooling: cooler (powered), ice box (early), vents to outside.
- Survivor comfortable range: 16–26 °C by default. Clothes widen it.
- Food rots faster when warm. Freezer rooms stop rot.

## Air and radiation shelter

- A room is **sealed** if it is enclosed, roofed and has no open door to outside.
- During a radiation cloud: outdoors and unsealed rooms get radiation. Sealed rooms stay clean.
- Late tech: air filters let a room stay clean even with its door used often.

## Furniture and production buildings

- Beds (bedroll → scrap bed → real bed → hospital bed).
- Tables, chairs, shelves, lamps, decorations ("Velvet Elvis painting").
- Workbenches: scrap bench, kitchen stove, smithy, tailor, chem bench, electronics bench, research desk.
- Storage: shelves (more items per tile), fridge (powered).

## Zones

- **Stockpile**: holds items. Filters by item type. Priority low → critical.
- **Growing zone**: crop type chosen per zone.
- **Home area**: survivors clean and firefight only here.
- **Allowed area**: limits where survivors may walk.
- **Dumping zone**: for corpses and junk.

## Salvage and scrap economy

- Ruins on the map are full of scrap. Salvage is the main early resource.
- Salvage result: scrap metal, wood, cloth, components (rare), and a loot roll (food cans, meds, weapons, blueprints).
- Scavenging skill raises yield and loot roll chance.
- Some ruins collapse when salvaged too fast (small danger).

## Demo subset

Build, deconstruct, salvage, mine, clear rubble, harvest. Scrap/wood/stone walls, doors, floors, auto-roof. Rooms + types (bedroom, kitchen, storage, workshop). Temperature (simple). Sealed rooms vs radiation. Stockpile + growing zones. Beds, table, chair, lamp, 4 workbenches.
