# Handover — Ash & Gears — 2026-10-12
> Status 2026-10-12 (later session): the tutorial is built and all checks pass. It is not committed or released yet. See CHANGELOG.md.

## Goal
The user builds "Ash & Gears", a colony game like RimWorld and Factorio, in `/home/marko/git_projects/game`.
Claude builds most of it alone. Claude also fixes realism, clarity and QoL gaps without being asked.

New request, not started yet (user's words):
> "i got feedback from a player that he did not know what ot do as he never played this type of games.
> can you make a tutorial scenario and a tutorial with guided gameplay. it needs to play the same every time.
> anda smaller map."

## Done so far
All earlier work is committed and released.
- Gitea `origin`: `master` at f3b9f87 (merge of `develop` fc710b8). GitHub `github`: `main` at the same commit.
- Pages: https://mundaplus.github.io/Ash-and-Gears/ (repo MundaPlus/Ash-and-Gears).
- The last release added: the field re-sow fix, too-cold crop info, room and calendar temperatures, the new bottom bar
  with shortcuts (B Build, O Orders, Z Zones, J Work, T Research, M World), build tabs, grouped orders and zones,
  the version in the lower left, auto reload on a new build, the drafted-move fix, batch cooking, skill XP lines,
  "call a researcher" on a manual, lines (wires/pipes) inside walls and the "remove line" order.
- See `CHANGELOG.md` (2026-10-11 and 2026-10-12) for the full list.

## Current state
- Branch `develop`, working tree clean (only this handover and a CHANGELOG line are new).
- Checks were green at fc710b8: 192 unit tests, 39 e2e passed, 1 skipped.
- No servers are known to run from this session. Preview runs on :4173 (`npm run build` then the e2e reuses it).
- `claude-memory` could not pull at session start (it uses the local copy). Check `~/.claude-memory` git state.

## Decisions
- Ask with AskUserQuestion before every push or release. The user answered "yes" or "Not yet" each time.
- Write all text in ASD-STE100 simple English. All player text goes through `t()` and `packages/data/i18n/en.json`.
- The tutorial must be deterministic: fixed seed, fixed map, no random events that change the flow.

## Next steps
1. Plan the tutorial. Suggested design (confirm the open points with AskUserQuestion):
   - Add scenario `"tutorial"` to `SCENARIOS` in `packages/sim/src/scenarios.ts`. It forces a fixed seed
     (for example "tutorial"), a small map (for example 80×80; the map size is the `size` option, default 200),
     storyteller off or scripted, and no raids or random events until the steps ask for them.
   - Hand-place the start: 2–3 named survivors, a known rock patch, trees, a ruin to salvage, food on the ground.
   - Add a guided step list in sim (like `packages/sim/src/goals.ts`, which already has `GOALS`, `goalHint`, `tickGoals`).
     Each step has a text key, a check function on the game state, and an optional UI highlight (button testid).
   - Suggested steps: move the camera and pause; select a survivor; build a stockpile zone (Z); order trees cut (O);
     build walls and a door (B); build a bed; set up a grow zone; set work priorities (J); cook a meal;
     research one item (T); draft and move survivors; survive one scripted small raid; done.
   - Client: a tutorial panel (Preact, in `packages/client/src/ui/`) with the step text, a progress count,
     "Next" when the check passes, and a pulse highlight on the needed button. Add a "Tutorial" button on the
     start screen (`packages/client/src/ui/Screens.tsx`, new game options near line 105–130).
   - Save the tutorial step in the save (`packages/sim/src/save.ts`).
2. Write unit tests: the tutorial map is the same on two runs (hash the terrain and things); each step check works.
3. Write an e2e test that walks the steps with the `window.__game` debug hooks and takes screenshots.
4. Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, then `npm run e2e`. Look at the screenshots.
5. Add the CHANGELOG entry. Ask the user before the release.

## Key files
- `packages/sim/src/scenarios.ts` — start scenarios (`SCENARIOS`, `startSurvivors`, `applyScenario`).
- `packages/sim/src/start.ts` — `setupStart`, `START_SUPPLIES`.
- `packages/sim/src/goals.ts` — early goals with hints; a model for tutorial steps.
- `packages/sim/src/mapgen.ts` — map generation.
- `packages/sim/src/storyteller.ts` — events and raids (turn off or script for the tutorial).
- `packages/client/src/ui/Screens.tsx` — start and new game screens (URL params seed, size, scen, ...).
- `packages/client/src/main.ts` — game setup, input, debug hook `window.__game`.
- `packages/client/src/ui/Toolbar.tsx`, `ui/MenuHead.tsx` — bottom bar; button testids for highlights.
- `packages/data/i18n/en.json` — all player text.

## Gotchas
- Always run `npm run build` before `npm run e2e`. The e2e reuses the :4173 server, which serves `dist`.
- `cp` and `mv` are interactive aliases. Use `/bin/cp -f` and `/bin/mv -f`.
- Do not run prettier on whole files. It reformats everything.
- Vitest hides `console.log`. Use `process.stderr.write` in scratch tests.
- gh CLI is not installed. Check Pages deploys with
  `curl https://api.github.com/repos/MundaPlus/Ash-and-Gears/actions/runs?per_page=3`.
- Release flow: `git checkout -q master && git merge -q --no-ff develop -m "..." && git push -q origin master develop && git push -q github master:main develop && git checkout -q develop`.
- Never print `~/.git-credentials`.
- Every new build makes open tabs reload by themselves (version.json check every 60 s).
