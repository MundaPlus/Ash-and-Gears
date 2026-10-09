# Changelog

## 2026-10-09
- Added the art sample tools (`tools/art/texel.ts`, `recolor.ts`, `png.ts`, `gallery.ts`, `gallery.template.html`, `samples.json`) — Phase B needs sample sprites in several sizes and palettes for the user to choose from.
- Painted samples in one palette only and made the others by index swap (`tools/art/samples.json`) — the local art model takes 10–30 minutes per sprite, so 66 jobs drop to 22.
- Set up the repo base (`package.json`, `.gitignore`) on branch `develop` — tools need tsx and TypeScript.
- Marked the spec as approved v1.0 (`docs/spec/README.md`, `docs/spec/00-overview.md`) — the user approved it.
- Added a spec web page builder (`tools/docs/build_spec_page.py`) and the built page (`docs/spec.html`), published as a private Artifact — the user wants to read the spec as one web page.
- Applied interview round 9 to the spec (`docs/spec/01-colonists.md`, `02-world.md`, `07-story.md`) — expeditions use auto-resolve plus optional tactical maps, thirst stays, day and season length are set at game start, story pitches are chosen at spec review.
- Added the game spec draft v0.1 (`docs/spec/`) — records the interview results and defines the full game and the demo subset.
- Set dev and preview servers to bind to 0.0.0.0 in the spec (`docs/spec/10-tech-architecture.md`) — the user wants LAN access from PC and phone.
