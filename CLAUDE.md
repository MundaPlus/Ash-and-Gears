# Ash & Gears (ex Wasteland Colony) — project notes for Claude

- Spec: `docs/spec/` (approved v1.0). Each chapter has a "Demo subset". Build only the demo subset until the demo review.
- Plan and milestones: `docs/spec/11-roadmap.md`. Work on branch `develop`. Remote: Gitea `admin/Ash-and-Gears` (origin). The old repo `admin/wasteland-colony` is remote `old-origin`.
- Monorepo: `packages/sim` (pure TS, no DOM, deterministic), `packages/client` (PixiJS + Preact), `packages/data` (JSON content + zod + i18n).
- All player text goes through `t()` from `@wc/data` with keys in `packages/data/i18n/en.json`.
- Dev/preview servers bind 0.0.0.0 (ports 5173/4173). Keep it that way.
- Checks: `npm run lint`, `npm run typecheck`, `npm test` (Vitest), `npm run e2e` (Playwright, screenshots in `artifacts/screens/`). Look at the screenshots after UI changes.
- Debug hook: `window.__game` (game, camera, renderer, runTicks, setSpeed, setLayer, pause).
- Art: `tools/art/` talks to texel-studio at :8500. Painting is slow on the local model (minutes per sprite). Placeholders come from `packages/client/src/render/textures.ts`.
- Write CHANGELOG.md entries for every change. Write text in ASD-STE100 simple English.
