# Handover — Ash & Gears — 2026-10-10 (late night)

## Goal
The user wants a full post-apocalyptic colony + automation game (RimWorld + Factorio), built mostly autonomously by Claude. Demo v0.1.0 done; the Alpha (P1, A1–A10 in `docs/spec/12-alpha-plan.md`) is now done and tagged `v0.2.0-alpha`. The plan says: check-in at the end of Alpha. **Now waiting for the user's Alpha review.**

## Done so far (all committed and pushed; `develop` and `master`)
- AI art: 32 px sprites for people, creatures, things, items, walls, floors (`tools/art/ai/`, `packages/client/src/render/aiArt.ts`, picks in `tools/art/ai/picks.json`).
- P1: rescue alarm, downed needs at half speed, attackers leave a beaten colony, smaller early raids, better scripted player.
- A1 logistics (splitter, sorter, tunnels, robot arm, chests, bench sides) · A2 fluids (pipes, pump, tank, purifier, tap, fuel still) · A3 power grid (poles, switch, solar, wind, priorities, overlay) · A4 tiers 2–3 (old bunker layer 2, dug stairs, blueprints, refinery, electronics, assembler) · A5 traits/backstories/relationships · A6 prisoners and wardens · A7 robots and drones · A8 world map, expeditions, outposts · A9 factions, goodwill, caravans, trade · A10 presentation (site + Artifact https://claude.ai/artifact/Cmp6bsbnXyoFTZYF8AGCPF), release tag.
- Tests: 83 unit, 14 e2e. Headless 12 seeds × 22 days: about 3–5 deaths.

## Current state
- Nothing in progress. Preview service `wasteland-colony` (vite preview 0.0.0.0:4173) serves the Alpha: http://192.168.31.215:4173/ (site: /site/, showcase: /?showcase=1, 32 px art: add `&px=32`).

## Decisions
- See `docs/spec/12-alpha-plan.md` → "Progress and decisions made during the work".
- Backstory work limits only on 3 of 24 backstories (more made colonies too weak).
- Caravans are 20% of good events; faction raids normal size.

## After the Alpha review (2026-10-11)
- User feedback: gameplay and music fine; wants more songs (done: 13 songs in mood pools); prefers the **16 px** look (32 px AI art stays as an option, no more work on it); everything top-down except people, plants and trees (done in 16 px); seamless vertical walls (done); door animation and 25% door slowdown (done); machine/bench animations (done); battery 1x2 with charge bar, wind turbine 2x2 (done); better 16 px terrain and floors (done); QoL: inspect tile actions with F as default (done).
- Own QoL picks done: alerts list, clickable messages, menu keys (B O Z J T M), forbid/allow stacks, stockpile filters, Dark Reader lock.

## Next steps
1. Show the user the 16 px pass and QoL changes; collect more feedback. Do not start Beta work before the user says so.
2. Open points to mention: glow hound AI art does not glow; no tactical expedition maps; diplomacy is gifts only; wanderers still join on their own; Chrome extension window was hidden (headless Playwright used for checks).

## Key files
- `docs/spec/12-alpha-plan.md` — plan, progress, decisions.
- `packages/sim/src/` — logistics, fluids, power, social, prison, robots, world, factions, mapgen.
- `packages/client/src/ui/` — WorldPanel, TradePanel, PawnPanel, Toolbar.
- `tools/docs/record.mjs` — clip recorder (needs the preview server and ffmpeg).

## Gotchas
- e2e reuses the running preview server: run `npm run build` before `npm run e2e`.
- Tests: set every work type to 0 (`WORK_TYPES`); an empty work table means default priority 3.
- Headless playtests vary a lot per seed: compare 12 seeds (`s1`..`s12`).
- Claude in Chrome may be hidden (visibilityState hidden); use headless Playwright scripts instead.
