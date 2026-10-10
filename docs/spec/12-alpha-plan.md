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

## Progress and decisions made during the work

| Milestone | State (2026-10-10) | Decisions |
|---|---|---|
| P1 | Done | Rescue alarm (nearest free doctor drops work, also when sulking); downed survivors lose hunger and thirst at half speed; attackers leave one hour after the last survivor goes down; raid cap = survivors − 1 before day 20, = survivors until day 40, then + 1. Headless runs, 12 seeds × 22 days: deaths 29 → 13 |
| A1 | Done | Splitter (front, left, right in turn), sorter (filter item forward, rest right), underground belt in/out pair (5 tiles, also carries power), robot arm (loader with a one-item filter), scrap chest (200 items, walkable; contents are item stacks so survivors use them; keeps rats and fallout out). Benches: input side north, output side south when not turned |
| A2 | Done | Fluid model: network pools like power; liters live on pipes and tanks. Fluids: water (dirty), clean water, fuel. Pump next to water (stops while surface water carries fallout), tank 500 L, purifier between two networks (bench sides), tap = drinking spot, fuel still (bill makes 15 L from 12 raw food), generators top up from fuel pipes |
| A3 | Done | Poles link poles within 6 tiles; switch; solar (by day, weather) and wind (gusts); priorities 1–3 with strict blackouts; power overlay (P) |
| A4 | Done | Third layer with the old bunker; dug stairs; blueprints from lockers and salvage; refinery → plastic, electronics, assembler. See below |
| A5 | Done | 30 traits, 24 backstories (only 3 rule out work: more made colonies too weak in headless runs), opinions/friends/rivals/lovers/family with mood effects |
| A6 | Done | Capture downed raiders, prisoner beds, warden work (feed, talk), resistance → recruit, release, escape after 2 days alone. Wanderers still join on their own |
| A7 | Done | Robot bay builds robots and hauler drones; charge, bay charging and repair; limited work types; no needs or mood. Robot art is hand-pixeled |
| A8 | Done | World of biomes and 14 sites; expeditions resolve off-map (travel, scavenge, ambush) and return at the map edge; outposts gather and are emptied by visits. No tactical site maps |
| A9 | Done | 4 factions with goodwill; faction raids; trader caravans with value trade and gifts; prisoners affect goodwill. Diplomacy beyond gifts (peace talks, allies helping) is left for later |
| A10 | Done, waiting for the review | Presentation updated (site + Artifact), showcase shows the Alpha, `master` tagged `v0.2.0-alpha`. Next: Alpha review with the user |

### A4 design (tech tiers 2–3)

- Tiers: tier 1 = demo tree plus plumbing, biofuel; tier 2 = belt logistics, purification, power grid, renewables, auto-crafting, plastics, electronics; tier 3 = the old bunker (layer 2), assembler, refinery, robots (A7).
- Blueprint items gate key tier 2–3 nodes. They come from salvage loot (rare), deep digging (layer 2) and later from expeditions and trade (A8–A9).
- New chains: steel (exists) → steel parts; plastic from fuel at a refinery; electronics from components + plastic.
- Second underground layer: an old bunker with sealed rooms, old-world loot and blueprints, reached by digging stairs down from layer 1.
