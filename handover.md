# Handover — Ash & Gears (ex Wasteland Colony) — 2026-10-10 (night)

## Goal
The user wants a full post-apocalyptic colony + automation game (RimWorld + Factorio), built mostly autonomously by Claude. Demo v0.1.0 is done. Now: Alpha milestones (see `docs/spec/12-alpha-plan.md`, table "Progress and decisions made during the work"). Check-ins only at the end of Alpha. LAN only. The user said: "you can probably work on something else while you wait" (for the AI art run) — keep working through the plan.

## Done so far (all committed and pushed to `develop`)
- AI art in game: `packages/client/src/render/aiArt.ts` (load, palette grade, wall joins), picks in `tools/art/ai/picks.json`, `tools/art/ai/publish.py` copies picks to `packages/client/src/assets/ai/<id>.<k>.png`. "32" size = AI things/floors/walls; "hybrid" and "32" = AI items/characters. `clean.py`: flood-fill background + big pure-white holes; seamless texture edges.
- 2×2 double bed. Chunk-edge draw fix (things layer above all chunk ground, `render/world.ts`).
- P1 done: rescue alarm (`medical.ts` `rushToDowned`), downed needs at half speed, attackers leave a beaten colony, raid cap by day, better scripted player (`tools/playtest/autoplay.ts`).
- A1 done: splitter, sorter, underground belts, robot arm, scrap chest (contents are item stacks with `chest` id; survivors haul into chests and take from them), bench input/output sides (`logistics.ts`, `items.ts`, `hauling.ts`, `bills.ts`).
- A2 done: pipes, pump, tank, purifier, tap, fuel still, generators fed from fuel pipes (`fluids.ts`).
- A3 done: power poles, switch, solar, wind, priorities + strict blackouts, power overlay (P key / ⚡ button) (`power.ts`, `render/dynamic.ts`).
- A4 done: third layer with the old bunker, dug stairs, blueprints from lockers/salvage, refinery (plastic), electronics, assembler (`mapgen.ts`, `construction.ts` `digDown`, `designations.ts`).
- Tests: 69 unit, 14 e2e pass. Headless 12 seeds × 22 days: 3 deaths.

## Current state
- Background AI art run (ComfyUI 192.168.31.205) is generating tries for all things/items/glow hound + 12 survivors / 10 raiders. Log: `/tmp/claude-1000/-home-marko-git-projects-game/91907f53-7a3c-4ea4-bc39-6c6b3a70a69b/scratchpad/make.log` (session scratchpad; may be gone in a new session). New raw tries are in `art/ai/<id>/raw_*.png` (gitignored), cleaned tries `art/ai/<id>/<n>.png`.
- A second art pass is still needed for the wall/floor texture prompts added later (wood_wall, stone_wall, ruin_wall, wood_floor, scrap_tiles, stone_tiles): run `uv run --with pillow --with numpy --with scipy python tools/art/ai/make.py --only wood_wall,stone_wall,ruin_wall,wood_floor,scrap_tiles,stone_tiles`.
- Preview service `wasteland-colony` (vite preview 0.0.0.0:4173) serves `packages/client/dist`; `npm run build` updates it.

## Decisions (user)
- Name Ash & Gears. Keep art selector (16 / hybrid / 32) and three palettes.
- AI art: method B (own colors), 32 px per tile; hand-made 16 px set stays. Bed is 2×2.
- Combat fair but dangerous. Robots = workforce with limits. Full factory late game. World map late Alpha.

## Next steps
1. When the art run ends: build a contact sheet (script idea: `art/ai/<id>/<n>.png` grid at 4×), pick the best try per id into `tools/art/ai/picks.json`, run `publish.py`, build, check with headless Playwright (see Gotchas), commit art + picks.
2. Run the wall/floor art pass (command above), pick, publish.
3. A5 Survivors I: about 30 traits and pre-/post-war backstories that set skills and quirks; relationships (opinions from talks and shared events; friends, rivals, lovers, family).
4. A6 Survivors II: capture downed raiders, prison rooms, warden work, recruiting.
5. A7 Robots, A8 world map + expeditions, A9 factions + trade, A10 Alpha delivery (presentation page, review with the user).

## Key files
- `docs/spec/12-alpha-plan.md` — plan, progress table, A4 design.
- `packages/sim/src/` — logistics.ts, fluids.ts, power.ts, medical.ts, mapgen.ts, bills.ts, items.ts (chests), hauling.ts.
- `packages/sim/test/` — logistics, fluids, power, deep (A4) tests.
- `packages/client/src/render/` — aiArt.ts, textures.ts, world.ts, dynamic.ts.
- `tools/art/ai/` — make.py, clean.py, sprites.json, picks.json, publish.py.
- `tools/playtest/` — run.ts, autoplay.ts.

## Gotchas
- Claude in Chrome: the Chrome window may be hidden or minimized (document.visibilityState "hidden", rAF paused, `window.__game` never set). Then use headless Playwright: a script like `node shot.mjs <url> <out.png> "<js expression>"` that imports `node_modules/playwright/index.mjs`, waits for `window.__game`, runs the expression, screenshots.
- Shell: never `pkill` by pattern. Use absolute paths.
- Tests: set every work type to 0 (`Object.fromEntries(WORK_TYPES.map(...))`); an empty work table means default priority 3, so survivors haul everything (also into new chests).
- Headless playtest results swing a lot per seed: compare 12 seeds (`s1`..`s12`) before and after a balance change.
- Context rule: this session used its one compaction; hand over again at 90%.
