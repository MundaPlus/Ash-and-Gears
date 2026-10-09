# 09 — Art and audio

## Art direction

- Top-down pixel art, three-quarter view for objects (walls show a front face), flat for floors.
- Sprite size and palette: **chosen by the user from samples** (Phase B). Candidates: 16 px, 32 px, or 16 px world + 32 px UI icons.
- Palette candidates: rust/ochre, toxic green, desaturated grey-blue. One master palette (24–32 colors) for all sprites.
- Survivors: single-frame sprites for 3 facings (down, up, side; side flipped). Portrait built from layered parts.
- Motion is procedural (bob, squash, flip, shake). No frame animation for the demo.
- Lighting: day/night tint + light radius from lamps and fires (shader).
- Weather: particle overlays (rain, dust, glowing radiation cloud).

## Asset pipeline (texel-studio)

1. `assets/manifest.json` lists every sprite: id, prompt, size, type (block/item), palette, tileset or not.
2. `tools/art/texel.ts` sends jobs to texel-studio (`POST /api/jobs`) and saves PNG + JSON in `assets/raw/`.
3. Claude views each result. Bad results get a `sprite.chat` refine or a retry with a new prompt.
4. `tools/art/pack.ts` packs sprites into a texture atlas with a JSON frame map.
5. Missing sprites fall back to generated placeholders (colored shapes with a letter), so the game always runs.

### Art providers

| Provider | Status |
|---|---|
| Local Ollama / llama-swap (default) | Works now |
| OpenRouter (OpenAI-compatible) | Config only (`OPENAI_BASE_URL` + key) |
| ComfyUI → texel `sprite.from_photo` | Build in art tool |
| Gemini / OpenAI subscription via CLI bridge | Optional, later |

## Music

- Adaptive music. The player blends stems by game state.
- **Situations**: calm (building), tense (threat coming), combat, night, expedition, victory/defeat stingers.
- **Tech tier changes the style**:
  - Tier 0–1: dusty western and folk (slide guitar, banjo, harmonica, fiddle).
  - Tier 2–3: folk mixed with dark ambient synth.
  - Tier 4: dark ambient synth with a hopeful theme.
- Combat at any tier: drums + tension layer in the current style.
- Generation: ComfyUI with an audio model (e.g. ACE-Step or Stable Audio Open). Check what is installed first. Ask the user before large downloads.
- Format: OGG (+ M4A fallback for iOS Safari), loop points in metadata.

## Sound effects

- Footsteps, building, mining, salvage clank, gunfire, hits, UI clicks, alerts, ambient wind, Geiger clicks near radiation.
- Sources: procedural (jsfxr-style) first, then generated or CC0 packs.

## Demo subset

Chosen art for about 80 sprites (terrain, structures, furniture, items, survivors, 2 creatures, 1 raider). Calm + combat music in tier 0–1 style. About 20 SFX.
