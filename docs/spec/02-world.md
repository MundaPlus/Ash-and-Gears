# 02 — World

## Home map

- Size options: small 128×128, medium 200×200 (default), large 256×256 tiles. Mobile default: small.
- One tile = one survivor-sized cell.
- Map generated from a seed + the world-map site (biome, ruin density, water, hills).

### Surface terrain

| Terrain | Notes |
|---|---|
| Cracked asphalt | Fast walking, no farming |
| Dirt / dry soil | Farmable (poor) |
| Rich soil (rare) | Farmable (good) |
| Sand / ash | Slow, no farming |
| Rubble | Slow; can be cleared for scrap |
| Shallow water / sludge | Dirty water source, slow |
| Toxic pool | Damages, rad source |
| Rock outcrop | Mineable, entrance to underground |

### Map features

- **Ruins**: collapsed houses, a gas station, a supermarket, a factory, a car park. Can be salvaged for scrap, parts, sometimes blueprints and loot crates.
- **Wrecks**: cars, buses, a crashed plane (rare). Salvage gives metal and parts.
- **Dead trees and mutant shrubs**: wood source.
- **Resource deposits**: scrap piles, stone, coal seam (underground), old fuel tank.
- **Hidden things**: a sealed bunker hatch, a buried cache (found when digging).

## Underground layers

- Demo: 1 layer ("Basement / Mine").
- Full game: 2–3 layers. Proposed: L-1 Basements and sewers, L-2 Mine and old metro, L-3 Deep bunker (story).
- Layers are separate maps with the same size. Stairs, ladders and lift shafts link them.
- Underground is solid rock by default. Survivors dig tunnels (Mining work).
- Underground rooms are safe from radiation clouds, weather and most raids. They are dark (need lights) and cold/hot by depth.
- Hazards: cave-ins (need supports), flooding, gas pockets, burrowing mutants, sewer nests.
- Player switches the visible layer with a button or key (PageUp/PageDown).

## World map

- Hex or grid map of the region, about 60×40 cells. Generated per game.
- Biomes: ash plains, irradiated forest, ruined city, dry riverbed, glowing crater, mountain pass, coast.
- Sites:
  - **Ruins to scavenge** (loot, blueprints, danger level).
  - **Faction towns** (trade, quests, diplomacy).
  - **Story locations** (one chain per storyline).
  - **Outposts** (player-built).
  - **Roaming threats** (raider bands, mutant herds) that move on the map.
- Seasons change the world map (winter closes passes, spring floods rivers).

## Expeditions

- Player chooses survivors, supplies and a vehicle (on foot → cart → truck).
- Travel time depends on distance, terrain, vehicle and load.
- At the site, two modes:
  - **Auto-resolve** (default): a short text log with 1–3 choices per event.
  - **Tactical map** (optional, for big sites): a small generated map where the player controls the team directly. Alpha ships auto-resolve; tactical maps come in beta.
- Rewards: scrap, parts, blueprints, recruits, story items. Risk: injury, death, capture.
- The home colony keeps running with fewer hands.

## Factions

| Faction | Type | Notes |
|---|---|---|
| The Rust Knights | Raiders, militaristic | Worship old cars. Frequent raids |
| The Shiny Smile Corp | Traders | Still selling insurance to the dead. Neutral |
| The Children of the Glow | Cult | Love radiation. Can be allies or a nightmare |
| The Last Bureaucrats | Remnant govt. | Demand paperwork. Have old-world tech |
| Mutant Herds | Not a faction | Animal behavior, territorial |

- Each faction has goodwill −100 to +100 with the player.
- Goodwill changes by trade, gifts, quests, raids, prisoners.
- Factions can be hostile, neutral or allied. Allies send help when asked.

## Trade

- Caravans visit the home map. Player can also visit faction towns.
- Currency: **"Scrip"** (old-world store coupons). Barter also works. (Bottle caps are avoided because Fallout uses them.)
- Prices depend on faction, goodwill and Social skill of the negotiator.

## Outposts

- Built on world-map sites with a survivor team (1–3).
- Types: mine, farm, scrap yard, water pump, radio relay (story).
- Produce resources every few days. Send caravans home or need a road/vehicle.
- Can be raided. Simplified sim (numbers, not a full map).

## Weather and seasons

- 4 seasons. Day length and season length are set at game start. Default: 1 day = 6 real minutes at 1x, 15 days per season.
- Weather: clear, overcast, dust storm, acid rain, heat wave, cold snap, **radiation cloud**.
- Temperature changes by season, weather, day/night and layer depth.

## Demo subset

Medium home map, surface + 1 underground layer, ruins/wrecks/trees/scrap, clear/rain/radiation cloud weather, 1 season cycle. No world map.
