/**
 * Generate the game's music with YuE2 on a ComfyUI server and save MP3s into the client.
 * Uses ComfyUI's built-in YuE2 nodes and the yue2_3b_bf16 checkpoint.
 * Usage: npx tsx tools/audio/comfy-music.ts [--server http://192.168.31.205:8188] [--only id,id] [--seconds 90]
 * Existing files are skipped, so a stopped run resumes. The game falls back to synthesized music
 * for any track that is missing.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const flag = (k: string, d: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const SERVER = flag("server", "http://192.168.31.205:8188").replace(/\/$/, "");
const SECONDS = Number(flag("seconds", "90"));
const ONLY = flag("only", "").split(",").filter(Boolean);
const OUT = "packages/client/public/music";

/** Mood/style tracks (spec 09: calm, tense, combat, night; western, folk, dark ambient synth by tech tier). */
export const TRACKS: { id: string; style: string }[] = [
  { id: "calm_western", style: "instrumental, dusty western, slow tempo, slide guitar, acoustic guitar picking, harmonica, lonely desert, warm, no vocals" },
  { id: "calm_folk", style: "instrumental, folk, gentle, banjo and fiddle, acoustic guitar, campfire, hopeful, slow, no vocals" },
  { id: "night_ambient", style: "instrumental, dark ambient, synth pads, drones, sparse, lonely wasteland at night, slow, no drums, no vocals" },
  { id: "tense", style: "instrumental, dark synth, tense, low pulse, ticking percussion, suspense, rising danger, no vocals" },
  { id: "combat", style: "instrumental, intense, war drums, distorted guitar riff, fast tempo, post-apocalyptic battle, no vocals" },
  { id: "calm_tech", style: "instrumental, folk guitar with analog synth pads, rebuilding, hopeful, mid tempo, retro electronics, no vocals" },
  { id: "calm_western_2", style: "instrumental, spaghetti western, twangy electric guitar, whistling melody, slow, wide open desert, dusty, no vocals" },
  { id: "calm_folk_2", style: "instrumental, americana folk, fingerpicked acoustic guitar, mandolin, quiet morning, warm, slow, no vocals" },
  { id: "calm_desert", style: "instrumental, desert blues, hypnotic guitar riff, hand drums, heat haze, slow groove, no vocals" },
  { id: "calm_tech_2", style: "instrumental, warm analog synthesizer, arpeggios, hopeful, workshop machines humming, mid tempo, no vocals" },
  { id: "night_ambient_2", style: "instrumental, dark ambient, wind, distant metallic echoes, deep drones, cold night, slow, no drums, no vocals" },
  { id: "tense_2", style: "instrumental, suspense, low strings and synth bass, heartbeat drum, something is coming, no vocals" },
  { id: "combat_2", style: "instrumental, fast industrial rock, heavy drums, aggressive guitar, metal clanging, battle, no vocals" },
];

async function post(path: string, body: unknown) {
  const r = await fetch(SERVER + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status} ${await r.text()}`);
  return r.json();
}

async function generate(id: string, style: string): Promise<void> {
  const file = join(OUT, `${id}.mp3`);
  if (existsSync(file)) return;
  // ComfyUI's built-in YuE2 pipeline (same as its "YuE2: Text to Music" template).
  const seed = Math.floor(Math.random() * 1e9);
  const wf = {
    "15": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "yue2_3b_bf16.safetensors" } },
    "25": {
      class_type: "YuE2GenerateMusic",
      inputs: { clip: ["15", 1], style, lyrics: "[intro]\n\n[instrumental]\n\n[outro]", abc: "", seed, mode: "full", max_duration: SECONDS, temperature: 1.0, top_p: 0.95, top_k: 100, repetition_penalty: 1.2 },
    },
    "18": { class_type: "ConditioningZeroOut", inputs: { conditioning: ["25", 0] } },
    "5": { class_type: "EmptyYuE2LatentAudio", inputs: { seconds: ["25", 1], batch_size: 1 } },
    "8": {
      class_type: "KSampler",
      inputs: { model: ["15", 0], seed, steps: 32, cfg: 1, sampler_name: "dpm_2", scheduler: "sgm_uniform", positive: ["25", 0], negative: ["18", 0], latent_image: ["5", 0], denoise: 1 },
    },
    "9": { class_type: "VAEDecodeAudio", inputs: { samples: ["8", 0], vae: ["15", 2] } },
    "10": { class_type: "SaveAudioMP3", inputs: { audio: ["9", 0], filename_prefix: `wasteland/${id}`, quality: "V0" } },
  };
  const { prompt_id } = await post("/prompt", { prompt: wf });
  const t0 = Date.now();
  for (;;) {
    await new Promise((r) => setTimeout(r, 15000));
    const h = await (await fetch(`${SERVER}/history/${prompt_id}`)).json();
    const entry = h[prompt_id];
    if (!entry) continue;
    if (entry.status?.status_str === "error") throw new Error(`${id}: ${JSON.stringify(entry.status.messages).slice(0, 500)}`);
    type AudioOut = { filename: string; subfolder: string; type: string };
    const outputs = (entry.outputs ?? {}) as Record<string, { audio?: AudioOut[] }>;
    const audio = Object.values(outputs).flatMap((o) => o.audio ?? [])[0];
    if (!audio) continue;
    const q = new URLSearchParams({ filename: audio.filename, subfolder: audio.subfolder, type: audio.type });
    const bytes = Buffer.from(await (await fetch(`${SERVER}/view?${q}`)).arrayBuffer());
    writeFileSync(file, bytes);
    console.log(`ok ${id}: ${(bytes.length / 1024).toFixed(0)} KB in ${Math.round((Date.now() - t0) / 1000)} s`);
    return;
  }
}

mkdirSync(OUT, { recursive: true });
for (const t of TRACKS) {
  if (ONLY.length && !ONLY.includes(t.id)) continue;
  try {
    await generate(t.id, t.style);
  } catch (e) {
    console.error(`FAIL ${t.id}: ${(e as Error).message}`);
  }
}
