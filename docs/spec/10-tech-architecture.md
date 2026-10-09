# 10 — Technical architecture

## Stack

| Part | Choice |
|---|---|
| Language | TypeScript (strict) |
| Renderer | PixiJS v8 (WebGL2, WebGPU when stable) |
| UI | HTML/CSS overlay with Preact |
| Build | Vite |
| Tests | Vitest (unit + headless scenarios), Playwright (browser e2e) |
| Data validation | zod |
| Lint/format | ESLint + Prettier |
| Mobile | PWA first, Capacitor later |
| Desktop | Tauri or Electron later (Steam option) |

## Repo layout (npm workspaces)

```
packages/
  sim/        pure TS simulation, no DOM, runs in Worker and Node
  client/     PixiJS renderer, input, UI, audio, save storage
  data/       JSON content + zod schemas + i18n strings (mod format)
tools/
  art/        texel-studio client, ComfyUI bridge, atlas packer
  audio/      music generation + processing
  playtest/   headless scenario runner, balance reports
site/         demo presentation web page
docs/spec/    this spec
assets/       manifest, raw generated art, packed atlases, audio
```

## Simulation

- **Deterministic**: seeded RNG (one stream per system), fixed tick (60 ticks per in-game minute at 1x is tuned later; target 20 sim ticks per real second at 1x).
- **Data-oriented entities**: typed arrays for tiles; entity store with components (Position, Pawn, Needs, Health, Item, Building, PowerNode, Belt...). Systems run in a fixed order per tick.
- **Map**: per layer, flat typed arrays (terrain, structure id, roof, room id, temperature, radiation, zone id). Chunked (32×32) for dirty-flag rendering.
- **Pathfinding**: A* on the grid with a region graph (regions of up to 12×12 connected tiles) for fast reachability checks and long paths. Cross-layer links via stairs. Path cache invalidated by region changes.
- **Jobs**: work givers scan for work by type; survivors pick by priority, distance and skill. Reservations stop two survivors from taking the same target. Jobs are small state machines (go to → pick up → go to → work → finish).
- **Rooms**: flood fill on wall/door change, incremental per affected area.
- **Temperature**: per room value, exchange per tick by insulation.
- **Power**: networks found by flood fill over wires; balance computed per network per N ticks.
- **Belts**: item slots on belt lanes, updated in batches.
- **Commands**: all player actions are command objects sent to the sim. This allows replays, tests and later multiplayer.

## Threading

- The sim runs in a Web Worker. The client gets a compact snapshot or a diff each frame (transferable buffers).
- The renderer interpolates pawn positions between ticks.
- Node runs the same sim directly for tests.

## Rendering

- Chunked tilemap (one Pixi container per chunk, cached when not dirty).
- Sprite layers: terrain, floor, structures, items, pawns, effects, overlays, UI markers.
- Culling outside the camera. Zoom levels with integer scaling for crisp pixels.
- Light pass: a darkness layer with light sprites (additive) for lamps and fires.
- Performance budget: 60 FPS desktop, 30+ FPS on a mid-range phone with a 128×128 map and 20 survivors.

## Saves

- Save = versioned JSON of the whole sim state, compressed (CompressionStream gzip), stored in IndexedDB.
- Export/import save file (download/upload).
- Migrations: one function per version step. Old saves always load.
- Autosave every in-game day (option). Permadeath: one slot, saved on quit.
- Cloud saves later: Steam Cloud (if on Steam) or a small paid save server.

## Mod support

- Content (items, buildings, recipes, research, events, traits, creatures, factions, strings) is JSON validated by zod.
- Mods are folders with a `mod.json` (id, version, load order, dependencies) + JSON + sprites.
- Mods can add and override entries by id. No scripting in v1.
- The base game is itself loaded as a "core" mod.

## Dev servers and network access

- **Dev and preview servers bind to `0.0.0.0`** so PCs and phones on the LAN can reach them (`vite --host 0.0.0.0`, also set in `vite.config.ts` `server.host` and `preview.host`).
- Fixed ports: dev 5173, preview 4173, presentation site served with the preview build.
- No secrets are served. The game is static files only.

## Debug and test hooks

- `window.__game` in dev builds: set seed, spawn things, set speed, run N ticks, get state, take snapshot.
- Headless scenario runner: `npm run playtest -- --seed 42 --days 30` prints a report (deaths, mood, resources, tick time).
- Playwright e2e: desktop (1920×1080) and phone (390×844) viewports. Screenshots and short videos saved in `artifacts/`.
- CI-like local script `npm run check` = lint + typecheck + unit + scenarios + e2e.

## Performance targets

| Metric | Target |
|---|---|
| Sim tick (20 survivors, medium map) | < 3 ms on desktop |
| Headless 30 in-game days | < 60 s |
| First load (web) | < 5 MB before first frame |
