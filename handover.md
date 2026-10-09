# Handover — Ash & Gears (ex Wasteland Colony) — 2026-10-10 (late)

## Goal
The user wants a full post-apocalyptic colony + automation game (RimWorld + Factorio), built mostly autonomously by Claude. The demo (v0.1.0) is done. Now: the polish milestone P1, then Alpha milestones A1–A10 (see `docs/spec/12-alpha-plan.md`). Check-ins only at the end of Alpha. LAN only.

## Done so far (this session, all committed and pushed to `develop`)
- Music: six YuE2 tracks from ComfyUI 192.168.31.205 (`tools/audio/comfy-music.ts`, `packages/client/public/music/`), crossfade by mood (`packages/client/src/audio.ts`).
- Roofs built by survivors; airlock (two doors in a row, outer one between walls) seals a room; contamination by chance (open 60/30%, leaky 20/8%, sealed 0) for radiation cloud / toxic rain (`packages/sim/src/rooms.ts`, `weather.ts`, `construction.ts`).
- Salvage vs Deconstruct orders split; plans over plants/junk clear them first; material shortage warning; plan needs in tile info.
- Walls join by neighbors (`wallVariant`), wires join and plug into machines with stubs (`lineVariant`), sandbags turn in columns, labels do not overlap.
- Art size selector: 16 / hybrid / 32 (`?px=hybrid`).
- Multi-tile things (`footprint` in things.json): beds 1×2, table/benches/stove/desk/smelter/generator 2×1, Q/E turns them. Big art = 16×16 grid with a repeated band (`thingGrid` in `packages/data/src/art/index.ts`).
- Water bills come before plain hauling (fixed colony dying of thirst).
- Post-demo interview → `docs/spec/12-alpha-plan.md` (name Ash & Gears, P1 + A1–A10). Spec page Artifact: https://claude.ai/artifact/594ypjYa2qzQCHW6cMSZt2
- Repo moved: origin = http://192.168.31.225:3333/admin/Ash-and-Gears.git (old repo = remote `old-origin`).
- P1 so far: renamed UI/site/README to Ash & Gears; fair-but-dangerous combat (downed bleed ×0.5, ×0.5 again above 0.8 blood loss; first fatal head/torso hit on a standing survivor downs instead unless blow ≥ 60% of part max) in `packages/sim/src/health.ts`; first-hour goal hints (`goalHint` in `packages/sim/src/goals.ts`, shown in `Hud.tsx`).
- AI pixel-art pipeline (`tools/art/ai/`): `make.py` (ComfyUI superPixelartXL, tries per sprite from `sprites.json`), `clean.py` = "method B" (crop, BOX shrink, own 15-color palette, dark outline; `texture` mode for walls). Output `art/ai/<id>/<n>.png` (+ raw_*.png, gitignored) and `art/ai/pick.html` (Artifact https://claude.ai/artifact/4Pn7rHSeakfWmF3Ya1eUY2). Trial page: https://claude.ai/artifact/TseYAmYTCo8XXAwyyfXRQ5

## Current state
- Everything committed (last: b8f2dac). Tests: 50 unit, 14 e2e pass. Demo service `wasteland-colony` (systemd user, vite preview 0.0.0.0:4173) serves the latest build: http://192.168.31.215:4173/
- No running processes of mine.

## Decisions (user)
- Name Ash & Gears. Keep the art selector (16 / hybrid / 32) and the three palettes.
- AI art: use **method B** (own colors) — user confirmed method B is better than palette-role mapping (A had blotches). AI art targets **32 px per tile**; hand-made 16 px set stays.
- Bed can become **2×2** (double bed) — user suggested it; AI bed art is 64×64.
- People: keep iterating (many tries) until usable ones appear. Chibi prompt works. Survivors read best; clothed raiders (bandana, vest) avoid flat blotches.
- Combat: fair but dangerous. Robots = workforce with limits. Full factory late game. World map late Alpha.

## Next steps
1. AI art integration (P1): load chosen `art/ai/<id>/<n>.png` as the "32 px" option for those ids (client textures: PNG sprites instead of index grids; palette switch → optional color grade for AI sprites). Change `scrap_bed` footprint to 2×2 and use the 64×64 art. Add a picks file (e.g. `tools/art/ai/picks.json`: id → chosen try).
2. Fix the can cleanup: white label parts are removed with the background (use flood fill from the border instead of a global color threshold in `clean.py`, as `tools/art/ai/clean.py` method A did).
3. Generate more tries for people; add more sprite ids (all things/items/creatures), walls/floors as textures with seamless edge fix.
4. Finish P1: UX fixes from play, then start A1 (belt logistics: splitters, filters, underground belts, robot arms, chests, machine I/O sides).
5. Keep playing in Chrome after each change (see Gotchas).

## Key files
- `docs/spec/` (00–12), `docs/spec/12-alpha-plan.md` — plan after demo.
- `packages/sim/src/` — simulation (rooms, construction, health, goals, weather, power, game.ts footprint/fits).
- `packages/client/src/render/{world,textures}.ts` — joined walls/wires, big things, art sizes.
- `packages/data/src/art/index.ts` — grids, `wallVariant`, `lineVariant`, `thingGrid`, `BIG_ART`.
- `tools/art/ai/{make.py,clean.py,sprites.json}` — AI sprite pipeline. Run: `uv run --with pillow --with numpy python tools/art/ai/make.py [--only id,id]`.
- `tools/playtest/run.ts` (`--seed`), `tools/playtest/autoplay.ts` — headless checks.
- `CHANGELOG.md`, `CLAUDE.md`.

## Gotchas
- Chrome (Claude in Chrome): a new tab starts hidden (black screenshots). One `left_click` in the tab makes it visible. Use `window.__game` for state.
- Shell: background `&` jobs and `cd` can lose the working directory; use scripts with `cd "$(dirname "$0")"` or absolute paths. Never `pkill` by pattern (killed my own shell before).
- ComfyUI 192.168.31.205: about 15–40 s per SDXL picture; shared GPU. `superPixelartXL` gives single objects; the `pixel-art-xl` LoRA gives sprite sheets.
- The shared style line in `sprites.json` breaks texture prompts → use `own_style: true` for walls/items.
- Headless playtests: seeds playtest, a1, b2, c3. A full raid wipe on c3 day 18 is accepted (weak scripted player, no defenses).
- Context rule: this session used its one compaction; the next session should hand over again at 90%.
