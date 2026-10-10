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

## New requests (2026-10-11, after v0.4.0)

### N1 — Surface buildings with upper floors, and sealed rooms with enemies

User: "add structures with the same number of stories to the surface so we can go up the same number of floors; rooms with closed doors that have enemies, like rats, dogs, hostile bots, turrets."

| Area | Decision (proposal) |
|---|---|
| Layers | Today: layer 0 surface, 1 caves, 2 deep (bunker). Add upper layers for buildings: a ruined tower on the surface has stairs up to floor 2 and 3. Layers above the surface are mostly empty air; only the tower footprint has floors and walls. Pathing already links layers through stairs |
| Ruined tower | Map generation places 1–2 ruined towers (e.g. 12x10) near the map edge, 2–3 stories, with stairs up on each floor; walls with gaps; loot crates and lockers upstairs |
| Sealed rooms | Some rooms have closed, locked doors (a new "sealed door" that survivors open with a work order, or break). Inside wait enemies that wake when the door opens: rad-rats, glow-hounds, hostile robots (raider-faction robot kinds), a powered turret (hostile faction turret) |
| Reward | Rooms hold better loot (manuals, components, weapons), so opening them is a choice |
| UI | Layer buttons show "Floor 2/3" above the surface; the layer bar lists all layers |
| Bunker | The deep bunker gets the same sealed rooms and enemies |

### N2 — Weapon and armor tiers through research

User: "we need research for weapons and armors of different tiers."

| Tier | Weapons (research) | Armor (research) |
|---|---|---|
| 0 | pipe, machete, crossbow (no research) | rags (cloth) |
| 1 | pipe pistol, scrap shotgun (Gunsmithing) | scrap vest (Scrap armor) |
| 2 | hunting rifle, nail gun (Rifling) | plated vest + helmet (Plate armor) |
| 3 | assault rifle, flamer (Advanced weapons) | combat armor (Composite armor, needs plastics) |
| 4 | rail gun / energy rifle (Energy weapons, needs electronics) | powered armor (Power armor, needs robotics) |

Needs: an apparel/armor slot on pawns (body and head), armor values that reduce damage by type (cut, blunt, gunshot, bite, burn), crafting recipes at the workbench / powered bench / assembler, equip logic (survivors pick the best they may use), print art for each piece and a small overlay on people.

### Order

N2 first (smaller, uses existing combat), then N1 (map generation, new layers, sealed rooms, hostile machines). The phone app moves after these.

### N3 — Stockpile filters per item

Status: done (2026-10-10). Sim and panel: ▸ per category, item toggles, partial state, Copy / Paste filter.

User: "the stockpile zones need more granularity if I want to use them for loaders and automation."

Today a stockpile takes whole categories (resources, food, ...). Add item-level filters: in the stockpile panel each category opens a list of its items with on/off toggles; a stockpile can take only scrap, for example, next to a loader. Sim: `Zone.allowItems?: string[]` (when set, items decide; categories stay for the quick view); `accepts()` checks items first; haul list and stockpile priority use the same check. Keep a "copy filter" / "paste filter" pair of buttons for many small stockpiles.

Updated order: N3 (small, helps automation now), N2, then N1, then the phone app.

### N4 — Remove old floors, salvage almost everything

User: "we should also be able to remove non-built floors from ancient structures. The only non-salvageable structures should be the structures that are multi-floor."

Remove floor also works on old floors (ruin floor, bunker floor, asphalt: they turn into the plain ground below, with a little scrap or stone back). Salvage works on all old structures and things except those that span several floors (stairs, and the planned multi-story towers).
