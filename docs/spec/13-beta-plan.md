# 13 — Beta plan

Started 2026-10-11 after the Alpha review. The user asked Claude to plan and build the Beta on its own, add its own improvements and polish, and then refine together.

## Goal

A full game loop with an end: pick a storyline at the start, play it to an ending (win slides or an obituary), or play a scenario or the sandbox. Plus tier-4 robots, a mod loader, an installable phone app and more polish.

## Decisions made by Claude (to refine with the user)

| Area | Decision |
|---|---|
| Story engine | Data-driven beats in `content/core/story.json`. A beat has a goal, conditions (research, items, built things, visited story sites, days, flags) and effects (messages, story sites on the world map, pawns, items, flags, win) |
| Storyline 1 | "Restart the old reactor": pitches 1 + 2 combined. HAL-PH, a maintenance bot that speaks in safety slogans, leads the way; the Children of the Glow (the Glow Cult faction) race for the same parts |
| Storyline 2 | "Reach the safe zone": pitch 2 "The Last Bus". Restore a school bus, upgrade it with parts from expeditions, then drive the colony to Haven Valley |
| Storyline 3 | "Signal the orbit": pitches 1 + 2. Night voices on an old radio, three relay outposts on the world map, a dish at home |
| Endings | Win: slides per survivor, made from their history (traits, backstory, friends, deeds). Loss: an obituary when nobody is left. Continue in sandbox after a win |
| Scenarios | Sandbox, Lone Wanderer, Mall Rats, The Bunker, Rad Season (Factory Reset later) |
| Tier 4 | Robot types: builder, miner, farmer, guard; raiders can hack a robot (event) |
| Mods | Content packs as JSON (same schema as core), loaded from the menu; validated with zod; a mod list in Settings |
| Phone app | Installable web app (PWA: manifest, service worker, offline cache). Capacitor build only if an Android SDK is set up |
| Polish | Own picks during every milestone; listed in the CHANGELOG |

## Milestones

| # | Milestone | Content |
|---|---|---|
| B1 | Story engine | Beats, conditions, effects, story sites, story items, story panel, endings (win slides, obituary, continue) |
| B2 | Storyline: the reactor | HAL-PH, five reactor parts at story sites, the Glow Cult race, reactor console, restart |
| B3 | Storyline: the last bus | Bus wreck, restoration, upgrades, convoy journey |
| B4 | Storyline: the orbit | Radio voices, three relays, the dish, the bargain |
| B5 | Scenarios | New game screen: storyline + scenario; Lone Wanderer, Mall Rats, The Bunker, Rad Season |
| B6 | Tier 4 robots | Builder, miner, farmer, guard robots; hacking event |
| B7 | Mods | Content packs, mod list, validation errors shown |
| B8 | Phone app | PWA install, offline, touch polish |
| B9 | Polish + music | Own polish list, story music cues |
| B10 | Beta delivery | Presentation update, tag `v0.3.0-beta`, review with the user |

## Progress (2026-10-11)

| # | Status |
|---|---|
| B1–B4 | Done |
| B5 | Done |
| B6 | Done |
| B7 | Done |
| B8 | Later (the user moved the phone app after B9 and B10) |
| B9 | In progress: story music cues, chapter banner, loose item counts, foldable goals, recreation and schedules, haul list, fuel and charge bars, progress bars |
| B10 | Not started |
