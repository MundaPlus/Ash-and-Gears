# 12 — Plan after the demo (Alpha)

Decided in the post-demo interview on 2026-10-10.

## Decisions

| Area | Decision |
|---|---|
| Name | **Ash & Gears** (repo `ash-and-gears`). "Wasteland Colony" was the working title |
| Before Alpha | A short polish pass on the demo (one milestone) |
| Alpha focus | Deeper automation first, then deeper survivors, then the world map |
| Automation parts | Belt logistics, pipes and fluids, power grid, drones and robots — all four |
| Machines vs survivors | Full factory late game: late tiers can run almost alone, survivors become managers and fighters |
| Robots | A workforce with limits: robots take jobs like survivors (haul, build, craft, mine), need power and repair, fight badly and cannot doctor |
| Survivor systems | Relationships, recruiting and prisoners, traits and backstories. (Mental-break variety and social fights later) |
| World map, expeditions, factions | Late Alpha, after automation and survivors |
| Combat | Fair but dangerous: small early raids, downed survivors usually live if treated, deaths come from bad choices |
| Check-ins | Only at the end of Alpha (like the demo). Claude runs all dev cycles alone |
| Publishing | LAN only for now (0.0.0.0:4173) |
| Art | Keep the selector (16 px, hybrid, 32 px) and the three palettes |

## Milestones

Each milestone ends like the demo ones: tests green, headless playtests on several seeds, screenshots checked, Chrome play session, commit, CHANGELOG entry.

| # | Milestone | Content |
|---|---|---|
| P1 | Demo polish | Combat balance (smaller early raids, downed survivors survive if treated, doctors rush to the downed, better autoplay fighter), first-hour hints, UX fixes, rename to Ash & Gears, new Gitea repo |
| A1 | Belt logistics | Splitters, filter belts, underground belts, robot arms (inserters) that move items between belts, chests and machines; input and output sides on big machines; storage chests |
| A2 | Pipes and fluids | Pipes, pump on water, tanks, purifier (dirty or contaminated to clean water), taps in rooms, fuel liquid for generators; simple flow model |
| A3 | Power grid | Power poles with range, switches, solar and wind, battery banks, priorities and blackouts, a power overlay |
| A4 | Tech tiers 2–3 | Bigger research tree, blueprints found by salvage and deep digging, steel and plastic chains, the second underground layer (old bunker), tier-3 machines |
| A5 | Survivors I | Traits (about 30) and backstories (pre-war and post-war) that set skills and quirks; relationships: opinions from talks and shared events, friends, rivals, lovers, family |
| A6 | Survivors II | Capture downed raiders, prison rooms, warden work, persuasion, recruiting wanderers and prisoners |
| A7 | Robots | Robot bay, charging, repair; robot workers with work priorities like survivors; hauling drones; late-tier full factory |
| A8 | World map + expeditions | World map, travel, scavenging sites, blueprint finds, outposts |
| A9 | Factions + trade | Named factions with goodwill, traders, raid variety, simple diplomacy |
| A10 | Alpha delivery | Updated presentation page with clips, LAN build, Alpha review with the user |

## Open items (decide during the work, no check-in needed)

- Exact tier list and research costs for tiers 2–3.
- Fluid model detail (per-tile pressure vs network pools). Default: network pools, like power.
- Robot art: hand-pixeled like the rest.
