# Handover — Ash & Gears — 2026-10-11 (end of session)

## Goal
The user wants a full post-apocalyptic colony + automation game (RimWorld + Factorio), built mostly autonomously by Claude, with Claude making "realism, clarity and quality-of-life" improvements on its own. Demo, Alpha, Beta done; v0.4.0 made the code-drawn "Salvage Print" art style the default. Now: user requests N1–N3 (`docs/spec/14-next-phase.md`), then the phone app.

## Done so far (committed and pushed: Gitea `origin` master+develop, GitHub `github` main+develop)
- Everything up to "Auto-crafter recipes show inputs and outputs" — see `CHANGELOG.md` (newest on top) and the previous summary in git history of this file.
- This last step (committed in the final commit of the session):
  - `packages/sim/src/links.ts` `ensureLinks`: runs at the end of `Game.create` and `loadGame`. Repairs stairs in pairs, and digs a route to the bunker (cave tunnel → service shaft `stairs_down` on layer 1 → tunnel on layer 2 to the westmost `bunker_door`) when none is reachable. Mall Rats clearing keeps stairs. Showcase `wayToBunker` removed (links cover it). Test `packages/sim/test/deep.test.ts` "showcase way to the bunker" still passes.
  - N3 sim part: `Zone.allowItems`, `zoneTakes`, `setZoneItem`, `setZoneFilter` (`hauling.ts`, `tileactions.ts`, `map.ts`).
- Checks at the end: 127 unit tests pass, 14 e2e pass, build OK.

## First: restart the running services
Do this at the start of the new session, before any other work:
1. `cd /home/marko/git_projects/game && git checkout develop && git pull --ff-only origin develop`
2. `npm install` (only if `package-lock.json` changed)
3. `npm run build` (the preview serves `packages/client/dist`)
4. `systemctl --user restart wasteland-colony` — systemd user service, vite preview on 0.0.0.0:4173 from `packages/client` (unit file `~/.config/systemd/user/wasteland-colony.service`)
5. Check: `systemctl --user status wasteland-colony --no-pager` shows "active (running)", and `curl -s -o /dev/null -w "%{http_code}" http://192.168.31.215:4173/` gives 200.
6. GitHub Pages needs no restart: it deploys on every push to GitHub `main`.

## Current state
- Working tree clean after the last commit. Preview service at http://192.168.31.215:4173/ (LAN); live on https://mundaplus.github.io/Ash-and-Gears/ (deploys from GitHub `main`).
- The user's own saved game gets the stairs and bunker route on its next load (ensureLinks in loadGame).

## Decisions
- Salvage Print is the default; pixel 16 stays (`?style=pixel`, Settings).
- Bunker access is given on foot (route dug by `ensureLinks`), because the user found digging down unclear. Deep digging research still allows digging elsewhere.
- Release flow: commit on `develop`, merge `--no-ff` into `master`, push `origin master develop` and `github master:main develop`.

## Next steps
1. Add unit tests for `ensureLinks`: (a) a new game: surface stairs reach the bunker door; (b) remove the surface `stairs_down`, save + load → it is back; (c) Mall Rats keeps stairs.
2. Finish N3 UI: in the stockpile panel (`packages/client/src/ui/Hud.tsx`, inspect `stockpile` from `main.ts`): per-category ▸ that opens item toggles (`setZoneItem`), category state on/partial, "Copy filter" / "Paste filter" (client clipboard → `setZoneFilter`); i18n keys; unit test for `zoneTakes` with `allowItems` (a scrap-only stockpile next to a loader).
3. New user request (not started): let the player remove floors that were not built by the colony (old floors of ancient structures, e.g. `ruin_floor`/`bunker_floor` terrain and ruin floors), and let everything be salvaged except structures that span several floors (stairs and, later, multi-story towers). Today `unfloor` only takes up built floors (`designations.ts` `canDesignate` case "unfloor") and salvage skips `stairs` and player-built things.
4. N2 weapon and armor tiers, then N1 towers with upper floors and sealed enemy rooms (plans in `docs/spec/14-next-phase.md`).
5. Phone app (PWA).
6. Keep finding realism/clarity/QoL gaps unasked (memory "feedback-gameplay-depth").

## Key files
- `docs/spec/14-next-phase.md` — plan, progress, N1–N3.
- `CHANGELOG.md` — every change, newest first.
- `packages/sim/src/links.ts`, `hauling.ts`, `tileactions.ts`, `designations.ts`, `construction.ts`, `ai.ts` — recent sim work.
- `packages/client/src/render/print/` — Salvage Print art; `render/dynamic.ts` — overlays; `ui/Hud.tsx` — inspect panel.

## Gotchas
- Always `npm run build` before `npm run e2e`.
- `cp` is `cp -i`: use `\cp -f`. Kill processes by exact PID (`pkill -f` can hit your own shell).
- Port 8765 is another app; use 8799 for test servers.
- GitHub token in `~/.git-credentials` (`https://MundaPlus:TOKEN@github.com`). Never print that file. It can push but cannot create Pages or re-run workflows.
- Vitest hides console output: write debug data to a scratchpad file.
- The session context window is 1M tokens; the context-guard hook reports the real usage.
