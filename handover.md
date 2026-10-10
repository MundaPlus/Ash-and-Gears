# Handover — Ash & Gears — 2026-10-11 (late)

## Goal
The user wants a full post-apocalyptic colony + automation game (RimWorld + Factorio), built mostly autonomously by Claude, with Claude making "realism, clarity and quality-of-life" improvements on its own. Demo, Alpha and Beta are done. v0.4.0 made the new "Salvage Print" art style the default. Many small user requests followed and are done (see CHANGELOG.md, newest on top). **Next: the new features N3, N2, N1 in `docs/spec/14-next-phase.md`, then the phone app.**

## Done so far (all committed and pushed: Gitea `origin` master+develop, GitHub `github` main+develop)
- Beta (v0.3.x): storylines, endings, scenarios, tier-4 robots, mods, colony life (recreation, schedules, graves, fuel, light), haul list, stockpile priority, make queue, tables, research expansion, refresh-resume, save files, GitHub Pages.
- v0.4.0: Salvage Print style (code-drawn, `packages/client/src/render/print/`: `kit.ts`, `sprites.ts` people, `ground.ts` terrain/floors/walls, `things.ts` all things + battery cells, `items.ts` items/creatures/robots, `textures.ts` builder). Pixel style stays (`?style=pixel`, Settings).
- After v0.4.0 (this session): single arrows, battery cells per 25% with blink, idle survivors give themselves salvage/cut orders (`designations.ts` `findOwnWork`, `ownWorkJob`), mellow work sounds per task (`audio.ts`), live inspect panel, print doors drawn live (slide, upright in N-S walls, `dynamic.ts` `printDoor`), build ghost under the cursor (`input/tools.ts`), visible blueprints + blueprint status (materials, workers, progress; `construction.ts` `blueprintStatus`), clean wall corners (`ground.ts` `wallTile`), new car wreck art + turned wrecks, showcase keeps stairs + way into the bunker, clearer stairs, belt cargo in inspect, grow/shrink zone buttons, Remove floor order (`unfloor`), auto-crafter recipes show inputs/outputs.
- Tests: 127 unit (Vitest), 14 e2e (Playwright). 12-seed playtest: about 2 deaths.

## Current state
- Nothing in progress; working tree clean. Preview service `wasteland-colony` serves the build at http://192.168.31.215:4173/ (LAN). Live on GitHub Pages: https://mundaplus.github.io/Ash-and-Gears/ (deploys on push to GitHub `main`).

## Decisions
- Salvage Print is the default style; pixel 16 stays as an option. People: high three-quarter view, 4 facings; raiders with respirator and tall mohawk.
- Self-chosen orders (idle work) never compete with real work; game option `idleWork` (tests that count resources set it false).
- A mood thought for darkness was cut (killed colonies in playtests).
- Release flow: commit on `develop`, merge `--no-ff` into `master`, push `origin master develop` and `github master:main develop`.

## Next steps
1. N3 stockpile filters per item (spec in `docs/spec/14-next-phase.md`).
2. N2 weapon and armor tiers (research, apparel slots, armor by damage type, recipes, print art).
3. N1 surface towers with upper floors, sealed rooms with enemies (rats, hounds, hostile bots, turrets); also in the bunker.
4. Phone app (PWA).
5. Keep looking for realism/clarity/QoL gaps on your own (user rule, see memory "feedback-gameplay-depth").

## Key files
- `docs/spec/14-next-phase.md` — plan, progress table, N1–N3.
- `CHANGELOG.md` — every change, newest first.
- `packages/client/src/render/print/` — Salvage Print art; `render/dynamic.ts` — overlays (doors, bars, blueprints).
- `packages/sim/src/` — simulation; `designations.ts`, `construction.ts`, `hauling.ts`, `power.ts`, `ai.ts` are the hot spots.

## Gotchas
- Always `npm run build` before `npm run e2e` (e2e uses the running preview server).
- `cp` is aliased to `cp -i`: use `\cp -f`. `pkill -f` can match your own shell; kill by exact PID.
- Port 8765 on this machine belongs to another app; use 8799 for test servers.
- GitHub token lives in `~/.git-credentials` as `https://MundaPlus:TOKEN@github.com`. **Never print that file.** The token can push but cannot create Pages or re-run workflows.
- The test config hides console output; write debug data to a file in the scratchpad instead.
- Showcase uses a random seed unless `&seed=` is given.
