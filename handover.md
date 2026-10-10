# Handover — Ash & Gears — 2026-10-11

## Goal
The user wants a full post-apocalyptic colony + automation game (RimWorld + Factorio), built mostly autonomously by Claude. Demo v0.1.0 and Alpha v0.2.0 are done. The Beta (B1–B7, B9, B10 in `docs/spec/13-beta-plan.md`) is now done and tagged `v0.3.0-beta`. **Waiting for the user's Beta review.** B8 (phone app, PWA) was moved after the Beta by the user ("phone will be later").

## Done so far (all committed and pushed; `develop` and `master`)
- B1–B4 story engine and three storylines (`packages/sim/src/plot.ts`, `content/core/story.json`), endings (`packages/client/src/ui/Ending.tsx`).
- B5 scenarios (`packages/sim/src/scenarios.ts`).
- B6 builder/miner/farmer/guard robots, raider hacking (`packages/sim/src/robots.ts`).
- B7 mods: JSON content packs (`packages/data/src/mods.ts`, `packages/client/src/mods.ts`, `ui/Mods.tsx`, `mods/wasteland-bakery.json`, `docs/modding.md`).
- B9 polish and user requests: story music cues, chapter banner, belts redrawn, pause-aware animation, robot bay battery, backup batteries, charge/fuel/progress bars, haul list + "haul now", stockpile priority, campfire/stove burn wood, wood regrowth + ash willow crop, graves, visible spoilage, electric heater, light (dark work 20% slower), recreation + schedules, click on map closes menus, work list colony-only, prison-bed alert, starvation-lock fix, compact robot chips.
- B10: presentation (`packages/client/public/site/index.html`, Artifact https://claude.ai/artifact/Cmp6bsbnXyoFTZYF8AGCPF version 3), tag `v0.3.0-beta`.
- Tests: 116 unit, 14 e2e. Headless 12 seeds × 22 days: about 5 deaths.

## Current state
- Nothing in progress. Preview service `wasteland-colony` (vite preview 0.0.0.0:4173) serves the Beta: http://192.168.31.215:4173/ (site /site/, showcase /?showcase=1&px=16, story game e.g. `?line=reactor&scen=standard`).

## Decisions
- The user prefers the hand-pixeled 16 px look; things are top-down, only people and plants side view.
- The user wants Claude to find and fix realism/clarity/QoL gaps on its own (see memory "feedback-gameplay-depth").
- A mood thought for darkness was cut: the playtest went from 3 to 16 deaths.

## Next steps
1. Get the user's Beta review; turn feedback into a plan.
2. B8 phone app: PWA manifest, service worker, offline cache, touch polish (Capacitor only if an Android SDK exists).
3. Known open issue: downed survivors after raids can die of thirst (seed s11).

## Key files
- `docs/spec/13-beta-plan.md` — Beta plan and progress table.
- `CHANGELOG.md` — every change, newest first.
- `scratchpad/batch.sh` (session scratchpad) — 12-seed headless playtest: `batch.sh <repo> 22 s1..s12`.

## Gotchas
- Always `npm run build` before `npm run e2e` (e2e uses the running preview server).
- `cp` is aliased to `cp -i`; use `\cp -f` in scripts.
- The showcase uses a random seed unless `&seed=` is given.
