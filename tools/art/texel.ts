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
 * Types: block (tileable, no transparency), icon, character, freeform.
 * Output: <out-dir>/<palette>/<size>/<id>.png and <id>.json.
 * Existing PNGs are skipped, so a stopped run resumes where it stopped.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import http from "node:http";
import { join } from "node:path";

const TEXEL_URL = (process.env.TEXEL_URL ?? "http://127.0.0.1:8500").replace(/\/$/, "");

interface SpriteDef {
  id: string;
  type: "block" | "icon" | "character" | "freeform";
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

/**
 * Post one job and read the SSE stream until a result or error event.
 * Uses node:http, not fetch: fetch aborts a stream after 5 minutes of silence,
 * and one model step on the local GPU can take longer than that.
 */
function runJob(kind: string, params: Record<string, unknown>): Promise<JobResult> {
  const url = new URL(`${TEXEL_URL}/api/jobs`);
  const body = JSON.stringify({ kind, params });
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: url.hostname, port: url.port, path: url.pathname, method: "POST", headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) } },
      (res) => {
        if (res.statusCode !== 200) {
          let err = "";
          res.on("data", (c) => (err += c));
          res.on("end", () => reject(new Error(`texel HTTP ${res.statusCode}: ${err}`)));
          return;
        }
        res.setEncoding("utf8");
        let buf = "";
        let event = "";
        let done = false;
        res.on("data", (chunk: string) => {
          buf += chunk;
          let nl: number;
          while (!done && (nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).replace(/\r$/, "");
            buf = buf.slice(nl + 1);
            if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("data:")) {
              if (event === "result") {
                done = true;
                resolve(JSON.parse(line.slice(5)) as JobResult);
                res.destroy();
              } else if (event === "error") {
                done = true;
                reject(new Error(`texel error: ${line.slice(5).trim()}`));
                res.destroy();
              }
            }
          }
        });
        res.on("end", () => !done && reject(new Error("texel stream ended without a result")));
        res.on("error", (e) => !done && reject(e));
      },
    );
    req.on("error", reject);
    req.end(body);
  });
}

async function paint(m: Manifest, s: SpriteDef, palette: string, size: number, outDir: string, log: string) {
  const dir = join(outDir, palette, String(size));
  const png = join(dir, `${s.id}.png`);
  if (existsSync(png)) return;
  mkdirSync(dir, { recursive: true });
  const prompt = m.styleHint ? `${s.prompt}. ${m.styleHint}` : s.prompt;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    if (await paintOnce(m, s, palette, size, dir, png, prompt, log, attempt)) return;
  }
}

/** The local model is shared with other programs, so a job can time out in texel's queue. Retry a few times. */
const RETRIES = 3;

async function paintOnce(m: Manifest, s: SpriteDef, palette: string, size: number, dir: string, png: string, prompt: string, log: string, attempt: number): Promise<boolean> {
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
    const line = `ok   ${palette}/${size}/${s.id} ${sec}s ${r.iterations ?? "?"} steps (try ${attempt})`;
    console.log(line);
    appendFileSync(log, line + "\n");
    return true;
  } catch (e) {
    const line = `FAIL ${palette}/${size}/${s.id} (try ${attempt}): ${(e as Error).message}`;
    console.error(line);
    appendFileSync(log, line + "\n");
    return false;
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
