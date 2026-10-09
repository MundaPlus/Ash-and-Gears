# 11 — Roadmap

## Gates (user decisions)

1. **Spec approval** — no game code before this.
2. **Art choice** — user picks sprite size and palette from samples.
3. **Demo review** — user plays the demo and gives feedback.

## Demo milestones

Each milestone ends with: tests green, a headless scenario run, Playwright screenshots checked, a git commit, and a CHANGELOG entry. No check-ins with the user until the demo.

| # | Milestone | Done when |
|---|---|---|
| M0 | Scaffold | Workspaces, Vite (host 0.0.0.0), TS strict, lint, Vitest, Playwright, project CLAUDE.md, CHANGELOG, Gitea remote |
| M1 | Map | Seeded home map with ruins/terrain/resources, 1 underground layer, chunk render, pan/zoom, layer switch |
| M2 | Survivors | 3 survivors walk with A*, job system, hunger/thirst/rest, mood + thoughts, skills, traits |
| M3 | Build | Build/deconstruct/salvage/mine orders, walls/doors/floors/roofs, rooms, temperature, stockpiles, hauling |
| M4 | Food + water | Farming, stove + meals, water sources + jugs, rot, radiation cloud + contamination |
| M5 | Threats | Rad-rats, glow-hounds, raiders, drafting, cover combat, injuries, scrap turret, storyteller + sliders |
| M6 | Early automation | Research desk + ~10 nodes, blueprint item, generator, wires, battery, conveyor, loader, auto-crafter |
| M7 | Polish | Save/load, tutorial goals, full desktop UI, mobile layout, texel art atlas, music + SFX |
| M8 | Demo delivery | LAN server on 0.0.0.0, Gitea push, presentation site with animations and gameplay clips |

## After the demo

| Phase | Content |
|---|---|
| Alpha | Full survivor systems, relationships, raiders + factions, world map, expeditions, trade, outposts, 2nd underground layer, tech tier 2–3 |
| Beta | Three storylines, scenarios, tier 4 robots, full music, mod loader UI, Capacitor mobile app |
| 1.0 | Balance, polish, more languages, optional Steam build, optional cloud saves |

## Risks

| Risk | Plan |
|---|---|
| Local AI art quality is uneven | Many retries, refine with `sprite.chat`, ComfyUI path, placeholder fallback |
| Mobile performance | Small map default, chunk caching, sim in Worker, profile early on phone viewport |
| Scope creep (full game) | Strict demo subset per spec file. Later phases only after demo review |
| Audio model missing in ComfyUI | Ask before install. Procedural SFX and simple music as fallback |
