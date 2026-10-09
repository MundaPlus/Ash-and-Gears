# 08 — UI and UX

## Principles

- Desktop-first. Mobile gets an adapted layout, not a copy.
- Pause is always one action away.
- Every tile, survivor and item can be inspected.
- Alerts tell the player what is wrong before it becomes a disaster.
- Dark humor lives in text, not in confusing UI.

## Desktop layout

```
+--------------------------------------------------------------+
| Resources bar (food, water, scrap, power, ...)   Date  Speed |
+--------------------------------------------------------------+
| Survivor bar (portraits, mood, status icons)                 |
|                                                     Alerts > |
|                    GAME VIEW                                 |
|                                                              |
| Inspect panel (selected thing)                               |
+--------------------------------------------------------------+
| Main menu tabs: Build | Orders | Zones | Work | Research |   |
| Schedule | Health | World | Log | Settings      Layer  Speed |
+--------------------------------------------------------------+
```

## Mobile layout

- Top: compact resource bar + date + pause button.
- Survivor portraits in a side drawer.
- Bottom: 5 big icon buttons (Build, Orders, Zones, Colony, Menu). Each opens a bottom sheet.
- Inspect panel is a bottom sheet over the view.
- Alerts are a badge button that opens a list.
- Minimum touch target: 44 px.

## Controls

| Action | Desktop | Mobile |
|---|---|---|
| Pan | WASD, arrows, middle-drag, edge scroll (option) | One-finger drag |
| Zoom | Mouse wheel | Pinch |
| Select | Left click | Tap |
| Box select | Left drag | Long press, then drag |
| Context order | Right click | Long press on target |
| Place building / drag area | Left click / drag | Tap / drag with "Place" button |
| Rotate | R | Rotate button |
| Cancel | Esc, right click | Back button / X |
| Pause | Space | Pause button |
| Speed 1/2/3 | 1 / 2 / 3 | Speed button cycles |
| Change layer | PageUp / PageDown | Layer button |
| Draft | D (selected) | Draft button |

## Screens

- Main menu: New game, Continue, Load, Scenarios, Mods, Settings, Credits.
- New game flow: mode → storyline → storyteller + sliders → map size + seed → survivor selection (reroll) → start.
- In-game panels: Work grid, Schedule, Research tree, Health, Survivor details (needs, skills, traits, thoughts, relations, gear), World map, Event log, Trade.
- Overlays: temperature, beauty, radiation, power, room, zones.

## Feedback

- Small procedural motion instead of sprite animation: bob while walking, flip by direction, shake on hit, tool icon over a working survivor, damage numbers (option).
- Thought bubbles with icons for needs.
- Sounds for orders, alerts, combat.

## Settings

- Audio volumes (master, music, SFX, ambient).
- UI scale, autopause rules, edge scroll, colorblind palette for overlays.
- Language.

## i18n

- All player-facing text comes from string tables (`en.json` first).
- Keys, plurals and parameters in ICU-like format.
- Generated names use per-language name lists.

## Accessibility

- Text size option. High-contrast overlay option. No info by color alone (icons too).

## Demo subset

Desktop layout complete. Mobile layout basic (bottom bar, sheets, pan/zoom/tap). Build, Orders, Zones, Work grid, Research, Health (simple), Log, Settings (audio, UI scale). English only through string table.
