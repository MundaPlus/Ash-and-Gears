/**
 * Record gameplay clips frame by frame (smooth even with software rendering), then encode MP4s.
 * Usage: node tools/docs/record.mjs <base-url> <out-dir> [clip ...]
 * Needs the preview server running and ffmpeg on PATH.
 */
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const [base, outDir, ...only] = process.argv.slice(2);
const W = 1280, H = 720, FPS = 30;

/** Each clip: url, setup(g) in the page, per-frame step(g, i, n) in the page, frames, ms of game time per frame. */
const CLIPS = {
  hero: {
    url: "/?showcase=1&seed=showcase&cinematic=1",
    frames: 330,
    ms: 50,
    setup: (g) => {
      const t = g.game.ticksPerDay;
      g.runTicks(Math.round(t * (9.5 / 24)) - (g.game.tick % t));
      g.setSpeed(2);
      g.camera.zoom = 1.25;
    },
    step: (g, i, n) => {
      const { x, y } = g.game.home;
      const k = i / n;
      g.camera.centerOn((x - 4 + k * 16) * 32, (y - 6 + k * 10) * 32);
      g.camera.zoom = 1.25 + Math.sin(k * Math.PI) * 0.25;
    },
  },
  build: {
    url: "/?seed=clip-build",
    frames: 300,
    ms: 50,
    setup: (g) => {
      const { game, sim } = g;
      const { x, y } = game.home;
      const L = game.map.layers[0];
      for (let ty = y - 10; ty <= y + 2; ty++)
        for (let tx = x - 10; tx <= x + 4; tx++) {
          const th = L.thing[L.i(tx, ty)];
          if (th !== -1) game.removeThing(th);
          game.setTerrain(0, tx, ty, "dirt");
        }
      sim.dropItems(game, "scrap", 150, 0, x + 2, y + 1);
      sim.dropItems(game, "wood", 80, 0, x + 3, y + 1);
      for (let tx = x - 9; tx <= x - 2; tx++)
        for (let ty = y - 9; ty <= y - 3; ty++) {
          const edge = tx === x - 9 || ty === y - 9 || tx === x - 2 || ty === y - 3;
          if (edge) sim.placeBlueprint(game, "thing", tx === x - 6 && ty === y - 3 ? "scrap_door" : "wood_wall", 0, tx, ty);
          else sim.placeBlueprint(game, "floor", "wood_floor", 0, tx, ty);
        }
      sim.placeBlueprint(game, "thing", "campfire", 0, x - 6, y - 6);
      g.setSpeed(3);
      g.camera.zoom = 1.5;
      g.camera.centerOn((x - 4) * 32, (y - 5) * 32);
    },
    // Time-lapse: extra ticks per frame.
    step: (g) => g.runTicks(14),
  },
  combat: {
    url: "/?showcase=1&seed=showcase",
    frames: 330,
    ms: 50,
    setup: (g) => {
      const { game, sim } = g;
      const t = game.ticksPerDay;
      g.runTicks(Math.round(t * (13 / 24)) - (game.tick % t));
      const { x, y } = game.home;
      const gid = game.newId();
      game.groups.set(gid, { id: gid, kind: "raid", size: 3, fleeing: false, arrived: game.tick });
      ["machete", "pipe_pistol", "pipe"].forEach((w, i) => {
        const p = sim.makeHostile(game, "human", "raiders", 0, x + 22, y - 8 + i * 3, gid, w);
        game.pawns.set(p.id, p);
      });
      for (const p of game.pawns.values()) if (p.faction === "colony") sim.setDrafted(game, p, true);
      g.setSpeed(1);
      g.camera.zoom = 1.2;
      g.camera.centerOn((x + 9) * 32, (y - 3) * 32);
    },
    step: () => {},
  },
  night: {
    url: "/?showcase=1&seed=showcase",
    frames: 360,
    ms: 50,
    setup: (g) => {
      const t = g.game.ticksPerDay;
      g.runTicks(Math.round(t * (18 / 24)) - (g.game.tick % t));
      g.setSpeed(3);
      g.camera.zoom = 1.15;
      const { x, y } = g.game.home;
      g.camera.centerOn((x + 1) * 32, (y - 2) * 32);
    },
    step: (g, i) => {
      g.runTicks(6);
      if (i === 150) g.sim.scheduleRadCloud(g.game, 0.4);
    },
  },
  factory: {
    url: "/?showcase=1&seed=showcase&cinematic=1",
    frames: 240,
    ms: 50,
    setup: (g) => {
      const t = g.game.ticksPerDay;
      g.runTicks(Math.round(t * (11 / 24)) - (g.game.tick % t));
      g.setSpeed(2);
      g.camera.zoom = 2.3;
      const { x, y } = g.game.home;
      g.camera.centerOn((x - 7) * 32, (y + 6.5) * 32);
    },
    step: () => {},
  },
  // Alpha clips: the 32 px AI art, logistics and water, robots, the old bunker.
  alpha: {
    url: "/?showcase=1&seed=showcase&cinematic=1&px=32",
    frames: 300,
    ms: 50,
    setup: (g) => {
      const t = g.game.ticksPerDay;
      g.runTicks(Math.round(t * (10 / 24)) - (g.game.tick % t));
      g.setSpeed(2);
      g.camera.zoom = 1.4;
    },
    step: (g, i, n) => {
      const { x, y } = g.game.home;
      const k = i / n;
      g.camera.centerOn((x - 10 + k * 20) * 32, (y - 9 + k * 12) * 32);
    },
  },
  logistics: {
    url: "/?showcase=1&seed=showcase&cinematic=1&px=32",
    frames: 270,
    ms: 50,
    setup: (g) => {
      const t = g.game.ticksPerDay;
      g.runTicks(Math.round(t * (12 / 24)) - (g.game.tick % t));
      g.setSpeed(2);
      g.camera.zoom = 2;
    },
    step: (g, i, n) => {
      const { x, y } = g.game.home;
      const k = i / n;
      // From the waterworks down to the factory line.
      g.camera.centerOn((x - 12 + k * 10) * 32, (y - 11 + k * 17.5) * 32);
    },
  },
  robots: {
    url: "/?showcase=1&seed=showcase&cinematic=1&px=32",
    frames: 240,
    ms: 50,
    setup: (g) => {
      const t = g.game.ticksPerDay;
      g.runTicks(Math.round(t * (14 / 24)) - (g.game.tick % t));
      g.setSpeed(3);
      g.camera.zoom = 1.9;
      const { x, y } = g.game.home;
      g.camera.centerOn((x + 10) * 32, (y - 5) * 32);
    },
    step: (g) => g.runTicks(4),
  },
  bunker: {
    url: "/?seed=showcase&cinematic=1&px=32",
    frames: 210,
    ms: 50,
    setup: (g) => {
      g.setLayer(2);
      const lk = [...g.game.things.values()].find((t) => g.game.reg.things.list[t.def].id === "bunker_locker");
      g.camera.zoom = 1.6;
      g.bunker = lk ? { x: lk.x, y: lk.y } : g.game.home;
    },
    step: (g, i, n) => {
      const k = i / n;
      g.camera.centerOn((g.bunker.x - 4 + k * 12) * 32, (g.bunker.y + 2) * 32);
    },
  },
};

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
for (const [name, clip] of Object.entries(CLIPS)) {
  if (only.length && !only.includes(name)) continue;
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(base + clip.url);
  await page.waitForFunction(() => window.__game?.ready === true);
  await page.evaluate(() => window.__game.capture());
  await page.evaluate(`(${clip.setup.toString()})(window.__game)`);
  const frames = join(outDir, `_${name}`);
  rmSync(frames, { recursive: true, force: true });
  mkdirSync(frames, { recursive: true });
  // Warm up a few frames so textures and UI settle.
  for (let i = 0; i < 8; i++) await page.evaluate((ms) => window.__game.frame(ms), clip.ms);
  for (let i = 0; i < clip.frames; i++) {
    await page.evaluate(([fn, i, n, ms]) => {
      new Function("g", "i", "n", `(${fn})(g, i, n)`)(window.__game, i, n);
      window.__game.frame(ms);
    }, [clip.step.toString(), i, clip.frames, clip.ms]);
    await page.screenshot({ path: join(frames, `f${String(i).padStart(4, "0")}.jpg`), type: "jpeg", quality: 88 });
  }
  await page.close();
  const mp4 = join(outDir, `${name}.mp4`);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", join(frames, "f%04d.jpg"), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "27", "-preset", "slow", "-movflags", "+faststart", mp4]);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", join(frames, `f${String(Math.floor(clip.frames / 2)).padStart(4, "0")}.jpg`), "-q:v", "4", join(outDir, `${name}.jpg`)]);
  rmSync(frames, { recursive: true, force: true });
  console.log(`${name}: ${clip.frames} frames -> ${mp4}${errors.length ? " ERRORS: " + errors.join("; ") : ""}`);
}
await browser.close();
