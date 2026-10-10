# Ash & Gears

A post-apocalyptic colony sim with progressive automation: RimWorld-style survivors, Factorio-style machines, dark humor. Runs in the browser on PC and phone.

- Spec: `docs/spec/` (approved v1.0)
- Presentation page: `/site/` on the game server
- Changelog: `CHANGELOG.md`

## Play

```bash
npm install
npm run build
npm run preview        # http://<this-machine>:4173/  (binds 0.0.0.0, reachable on the LAN)
```

URL options: `?showcase=1` (a grown colony), `?seed=abc`, `?story=grandma|sheriff|chaos`, `?palette=rust|toxic|ash&px=16|32`.

## Develop

```bash
npm run dev            # Vite dev server on 0.0.0.0:5173
npm run check          # lint + typecheck + unit tests + browser tests
npm test               # Vitest (sim)
npm run e2e            # Playwright, desktop + phone; screenshots in artifacts/screens/
npm run playtest -- --seed alpha --days 25   # headless game with a scripted player
npx tsx tools/playtest/duel.ts hound 3 30    # fight odds
node tools/docs/record.mjs http://127.0.0.1:4173 packages/client/public/site/media   # trailer clips
```

## Layout

| Path | What |
|---|---|
| `packages/sim` | Pure TypeScript simulation, deterministic, no DOM |
| `packages/client` | PixiJS renderer, Preact UI, audio, saves; `public/site/` is the presentation page |
| `packages/data` | Content JSON (mod format), zod schemas, i18n strings, hand-pixeled art grids |
| `tools/art` | texel-studio client, palette tools, sample gallery |
| `tools/playtest` | Headless playtests and fight odds |
| `tools/docs` | Spec page builder, screenshots, trailer recorder |
