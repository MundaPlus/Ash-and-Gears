# 14 — Next phase (after the Beta)

Started 2026-10-11 after the Beta (v0.3.x). The user asked for a second art style and moved the phone app here.

## Goals

1. A second art style, "Salvage Print". The 16 px pixel art stays as an option.
2. The phone app (B8 from the Beta plan).
3. Keep adding gameplay depth, as before. The user asked Claude to find and fix such gaps on its own.

## Art style 2: "Salvage Print"

The user asked for a cleaner, more readable style in the family of RimWorld and Prison Architect. It must be distinct enough that nobody takes it for the work of those studios.

### What the reference games do (avoid copying these signatures)

| Game | Signature to avoid |
|---|---|
| RimWorld | Painted sprites with soft gradients; pawns are a floating head on a body with no arms or legs, front/side/back views; muted natural palette |
| Prison Architect | Clean flat vector shapes, bright saturated colors, thin outlines; people as round heads on simple bodies from straight above |

### Our signature: a screen-printed wasteland zine

| Element | Decision |
|---|---|
| Technique | Shapes are drawn in code (canvas paths), not pixel grids. Textures are made at load time for each zoom level, so the art is sharp at every zoom |
| Inks | Each object uses 2–3 "inks" from one small set: rust orange, oxidised teal, bone white, soot black, and a toxic glow green that only radiation uses. Inks are flat, with no gradients |
| Shading | Halftone dots in the ink color, not gradients or soft shadows |
| Print error | Color layers sit 1 px off the outline, like a cheap two-color print. This gives a worn, hand-made feel |
| Outline | A thick soot-black ink line with a slight hand-drawn wobble. Its width does not change with zoom |
| View | Strictly top-down for things, floors and terrain. Walls show only their top face, with a cast shadow line on one side |
| People | High three-quarter view from above, 4 facings. Hooded or capped heads, **visible arms that hold the tool or weapon in use**, a backpack or bedroll on the back, and short legs under a poncho or coat with a 2-frame shuffle when walking. Body shapes vary (tall, short, broad). This differs from both floating-head styles |
| Creatures | The same ink rules; rad-rats and glow-hounds carry glow-green halftone patches |
| Terrain | Paper-grain noise under halftone dirt, ink-line cracks, and edges that blend with dithered dots |
| Palettes | Ink sets replace the palette option: Rust (default), Ash (grey-blue), Toxic (sick green) |
| UI | The UI stays as it is. A matching "printed" UI skin is optional and comes last |

The 16 px pixel style stays as an option: **Settings → Art style: Pixel 16 / Salvage Print**. Both styles use the same footprints and the same rotation rules, so a game can switch style at any time.

### Milestones

| # | Milestone | Content |
|---|---|---|
| S1 | Drawing kit + style samples (**gate**) | A small TypeScript drawing kit (paths, ink fills, halftone, print offset, wobbly outline), a one-page style guide, and samples: one survivor in 4 facings, a raider, a wall corner, a bed, a workbench, a battery, a conveyor and a patch of terrain. **The user approves or corrects the style before mass production** |
| S2 | Ground | Terrain types, edges, floors, walls and doors, roofs overlay |
| S3 | People | Survivors: bodies, coats, hair and caps from the same parts as the pixel style; arms with tools and weapons; downed and sleeping poses; raiders, traders and prisoners |
| S4 | Things | Furniture, benches, machines, power and logistics pieces, story buildings, with the working animations the pixel style has |
| S5 | Items, creatures, effects | Items, rad-rats, glow-hounds, robots, fire, smoke, sparks, radiation cloud, light |
| S6 | Settings + polish | Style switch in Settings and on the title screen, screenshots for the presentation, optional printed UI skin |

### Risks

- Drawing every sprite as code is a lot of work. The drawing kit must make one sprite a short description: a list of shapes with ink names. Mods can then add Salvage Print art the same way.
- Performance: textures are made once per zoom tier and cached. Belts and machines reuse their animation overlays.

## Phone app (B8, moved here)

Installable web app (manifest, service worker, offline cache of the build), touch polish (bigger hit areas, long-press for the inspect panel, two-finger pan). A native wrapper only if an Android SDK exists.

## Order

1. S1, then the user's style review (gate).
2. S2–S6.
3. Phone app.

## Progress (2026-10-11)

| # | Status |
|---|---|
| S1 | Done. The user approved the style; raider masks and mohawks reworked after review |
| S2 | Done: 15 terrains with variants and borders, 3 floors, walls in 6 materials, doors |
| S3 | Done: 12 survivor looks and 3 raider looks, 4 facings, walking steps |
| S4 | Done: all 61 things with turned versions, wires and pipes |
| S5 | Done: all 38 items, creatures and robots; effects keep their animated overlays |
| S6 | Done: Salvage Print is the default (user request), switch in Settings, README and presentation screenshots and clips retaken |
| Phone app | Next |
