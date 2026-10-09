# 00 — Overview

Status: APPROVED v1.0 (2026-10-09). Code name: `wasteland-colony`. Title: picked later.

## Elevator pitch

The bombs fell. The survivors joked about it. Lead a small group of survivors in a ruined world. Build a home in the rubble. Keep them fed, sane and alive. Salvage the old world's machines. Slowly let the machines do the work. Then reach for a bigger goal: light, rescue or the stars.

## Inspirations

| Game | What we take |
|---|---|
| RimWorld | Indirect control, small cast with stories, storytellers, mood, drafting |
| Dwarf Fortress | Underground layers, deep simulation, emergent chaos |
| Factorio | Production chains, belts, power, the joy of automation |
| Fallout 1/2 | Post-apocalyptic world, dark humor, factions, scavenging |

## Design pillars

1. **Every survivor is a story.** 3–20 survivors. Each has a name, a past, traits, relationships and a body that can break.
2. **From scrap to machines.** The colony starts with bare hands. Tech replaces labor step by step. Late game, survivors manage machines, not haul rocks.
3. **The wasteland pushes back.** Raiders, mutants, radiation and the survivors themselves create the drama.
4. **Laugh so you do not cry.** Dark humor in names, events, item descriptions and mood thoughts. The world is grim. The writing is not solemn.
5. **Readable on a phone.** Desktop-first, but every system must be playable on a phone screen.

## Target player

- Fans of RimWorld, Dwarf Fortress, Factorio, Oxygen Not Included.
- Plays sessions of 20 minutes (mobile) to 3 hours (desktop).
- Likes stories that come from systems, not scripts.

## Platforms

| Platform | Phase |
|---|---|
| Web browser (desktop) | Demo |
| Web browser (mobile, PWA) | Demo |
| Android / iOS app (Capacitor) | After demo |
| Desktop app / Steam (Tauri or Electron) | Optional, after demo |

## Game modes

- **Story mode**: choose one of three storylines (see `07-story.md`). Ends with a win or a colony wipe.
- **Sandbox**: no goal. Play forever.
- **Scenarios**: fixed maps with goals and a score.
- **Permadeath**: an option for any mode. One autosave. No reload.

## Core loop

1. Survivors gather, salvage, build, farm and craft.
2. The colony grows. It faces events, raids and disasters.
3. Research and salvaged blueprints unlock new tech.
4. Tech unlocks automation. Survivors are free for expeditions and defense.
5. Expeditions on the world map bring blueprints, trade and allies.
6. The story goal advances.

## Scope phases

| Phase | Content |
|---|---|
| Demo | Home map, 1 underground layer, 3 survivors, core needs, building, farming, water, radiation event, mutant raid, research tier 1, power, first belt and crafter, save/load |
| Alpha | All survivor systems, raiders, factions, world map, expeditions, trade, outposts, 2 underground layers, tech tiers 1–3 |
| Beta | Three storylines, scenarios, robots and tier 4 tech, full music, mod loader, mobile app |
| 1.0 | Balance, polish, more languages, optional Steam build, optional cloud saves |

## Out of scope

- Multiplayer.
- Full z-levels like Dwarf Fortress (we use a few separate layers).
- Animated sprites with many frames (texel-studio makes single frames; we use small procedural motion instead).
