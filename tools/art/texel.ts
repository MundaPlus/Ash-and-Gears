/**
 * texel-studio client. Paints every sprite in a manifest and saves PNG + JSON.
 *
 * Usage: npx tsx tools/art/texel.ts <manifest.json> <out-dir> [--concurrency N] [--only id,id]
 *
 * Manifest shape:
 *   { "model": "qwen3.6:35b",
 *     "sizes": [16, 32],
 *     "palettes": { "rust": ["#rrggbb", ...] },
 *     "styleHint": "text added to every prompt",
 *     "sprites": [{ "id": "survivor", "type": "item", "prompt": "..." }] }
 *
 * Output: <out-dir>/<palette>/<size>/<id>.png and <id>.json.
 * Existing PNGs are skipped, so a stopped run resumes where it stopped.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";

const TEXEL_URL = (process.env.TEXEL_URL ?? "http://127.0.0.1:8500").replace(/\/$/, "");

interface SpriteDef {
  id: string;
  type: "block" | "item";
  prompt: string;
  /** Limit this sprite to some sizes only. */
  sizes?: number[];
}

interface Manifest {
  model?: string;
  sizes: number[];
  palettes: Record<string, string[]>;
  styleHint?: string;
  /** Paint only in this palette. tools/art/recolor.ts makes the others by index swap. */
  paintPalette?: string;
  sprites: SpriteDef[];
}

interface JobResult {
  image_path: string;
  pixel_data: number[][];
  iterations?: number;
}

/** Post one job and read the SSE stream until a result or error event. */
async function runJob(kind: string, params: Record<string, unknown>): Promise<JobResult> {
  const res = await fetch(`${TEXEL_URL}/api/jobs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind, params }),
  });
  if (!res.ok || !res.body) throw new Error(`texel HTTP ${res.status}: ${await res.text()}`);
  const decoder = new TextDecoder();
  let buf = "";
  let event = "";
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    buf += decoder.decode(chunk, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).replace(/\r$/, "");
      buf = buf.slice(nl + 1);
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) {
        if (event === "result") return JSON.parse(line.slice(5)) as JobResult;
        if (event === "error") throw new Error(`texel error: ${line.slice(5).trim()}`);
      }
    }
  }
  throw new Error("texel stream ended without a result");
}

async function paint(m: Manifest, s: SpriteDef, palette: string, size: number, outDir: string, log: string) {
  const dir = join(outDir, palette, String(size));
  const png = join(dir, `${s.id}.png`);
  if (existsSync(png)) return;
  mkdirSync(dir, { recursive: true });
  const prompt = m.styleHint ? `${s.prompt}. ${m.styleHint}` : s.prompt;
  const t0 = Date.now();
  try {
    const r = await runJob("sprite.generate", {
      prompt,
      colors: m.palettes[palette],
      size,
      model: m.model,
      sprite_type: s.type,
    });
    const img = await fetch(`${TEXEL_URL}/api/images/${r.image_path}`);
    if (!img.ok) throw new Error(`image HTTP ${img.status}`);
    writeFileSync(png, Buffer.from(await img.arrayBuffer()));
    writeFileSync(
      join(dir, `${s.id}.json`),
      JSON.stringify({ id: s.id, prompt, size, type: s.type, palette, colors: m.palettes[palette], pixel_data: r.pixel_data }),
    );
    const sec = ((Date.now() - t0) / 1000).toFixed(0);
    const line = `ok   ${palette}/${size}/${s.id} ${sec}s ${r.iterations ?? "?"} steps`;
    console.log(line);
    appendFileSync(log, line + "\n");
  } catch (e) {
    const line = `FAIL ${palette}/${size}/${s.id}: ${(e as Error).message}`;
    console.error(line);
    appendFileSync(log, line + "\n");
  }
}

async function main() {
  const args = process.argv.slice(2);
  const [manifestPath, outDir] = args;
  if (!manifestPath || !outDir) {
    console.error("usage: texel.ts <manifest.json> <out-dir> [--concurrency N] [--only id,id]");
    process.exit(2);
  }
  const flag = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const concurrency = Number(flag("--concurrency") ?? 1);
  const only = flag("--only")?.split(",");
  const m = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
  mkdirSync(outDir, { recursive: true });
  const log = join(outDir, "run.log");

  // Order: sprite first, so every palette/size of one sprite finishes close together.
  const tasks: (() => Promise<void>)[] = [];
  for (const s of m.sprites) {
    if (only && !only.includes(s.id)) continue;
    for (const size of s.sizes ?? m.sizes)
      for (const p of m.paintPalette ? [m.paintPalette] : Object.keys(m.palettes)) tasks.push(() => paint(m, s, p, size, outDir, log));
  }
  console.log(`${tasks.length} jobs, concurrency ${concurrency}`);
  let next = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < tasks.length) await tasks[next++]();
    }),
  );
}

main();
