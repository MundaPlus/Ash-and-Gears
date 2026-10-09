import { Application, Container } from "pixi.js";
import { h, render } from "preact";
import { loadCoreContent, t } from "@wc/data";
import { Game, NO_THING, TICKS_PER_SECOND } from "@wc/sim";
import { Camera } from "./input/camera.ts";
import { makePlaceholderTextures, TILE } from "./render/textures.ts";
import { WorldRenderer } from "./render/world.ts";
import { Hud } from "./ui/Hud.tsx";
import { actions, store } from "./ui/store.ts";

/** Most sim ticks per frame, so a slow frame cannot snowball. */
const MAX_TICKS_PER_FRAME = 12;

async function boot() {
  const params = new URLSearchParams(location.search);
  const seed = params.get("seed") ?? Math.random().toString(36).slice(2, 8);
  const mapSize = Number(params.get("size") ?? 200);
  const game = Game.create(loadCoreContent(), { seed, mapSize });

  const app = new Application();
  const host = document.getElementById("game")!;
  await app.init({ resizeTo: host, background: "#1b1714", antialias: false, autoDensity: true, resolution: Math.min(window.devicePixelRatio, 2) });
  host.appendChild(app.canvas);

  const world = new Container();
  app.stage.addChild(world);
  const renderer = new WorldRenderer(game, makePlaceholderTextures(game.reg));
  world.addChild(renderer.root);

  const camera = new Camera(app.canvas, world, { w: game.map.w * TILE, h: game.map.h * TILE });
  camera.centerOn((game.map.w * TILE) / 2, (game.map.h * TILE) / 2);
  camera.onTap = (wx, wy) => inspectTile(Math.floor(wx / TILE), Math.floor(wy / TILE));

  let speed = 1;
  let paused = false;
  let acc = 0;

  actions.setSpeed = (s) => {
    speed = s;
    paused = false;
  };
  actions.togglePause = () => (paused = !paused);
  actions.setLayer = (l) => {
    const n = Math.max(0, Math.min(game.map.layers.length - 1, l));
    renderer.setLayer(n);
    store.set({ layer: n, inspect: null });
  };

  function inspectTile(x: number, y: number) {
    const L = game.map.layers[renderer.layer];
    if (!L.inBounds(x, y)) return store.set({ inspect: null });
    const i = L.i(x, y);
    const td = game.reg.terrain.list[L.terrain[i]];
    const lines = [t("inspect.tile", { x, y })];
    if (td.solid) lines.push(t("inspect.solid"));
    else lines.push(t("inspect.walk", { v: td.walkCost }));
    if (td.fertility > 0) lines.push(t("inspect.fertility", { v: Math.round(td.fertility * 100) }));
    if (td.water) lines.push(t("inspect.water", { v: td.water }));
    let title = t(`terrain.${td.id}`);
    const th = L.thing[i];
    if (th !== NO_THING) {
      const thing = game.things.get(th)!;
      const def = game.reg.things.list[thing.def];
      title = `${t(`thing.${def.id}`)} · ${title}`;
      lines.push(t("inspect.hp", { hp: thing.hp, max: def.hp }));
    }
    store.set({ inspect: { title, lines } });
  }

  window.addEventListener("keydown", (e) => {
    if (e.key === " ") {
      e.preventDefault();
      actions.togglePause();
    } else if (e.key === "1" || e.key === "2" || e.key === "3") actions.setSpeed(Number(e.key));
    else if (e.key === "PageUp") actions.setLayer(renderer.layer - 1);
    else if (e.key === "PageDown") actions.setLayer(renderer.layer + 1);
    else if (e.key === "Escape") actions.closeInspect();
  });

  let fpsFrames = 0, fpsTime = 0, uiTime = 0;
  app.ticker.add((tk) => {
    const dt = Math.min(tk.deltaMS, 250) / 1000;
    if (!paused) {
      acc += dt * TICKS_PER_SECOND * speed;
      let n = Math.min(Math.floor(acc), MAX_TICKS_PER_FRAME * speed);
      acc -= Math.floor(acc);
      while (n-- > 0) game.step();
    }
    camera.update(dt);
    renderer.update(camera.view, camera.zoom);

    fpsFrames++;
    fpsTime += dt;
    uiTime += dt;
    if (uiTime > 0.2) {
      const tm = game.time;
      const pad = (v: number) => String(v).padStart(2, "0");
      store.set({
        speed,
        paused,
        clock: t("clock", { day: tm.day, hh: pad(tm.hour), mm: pad(tm.minute) }),
        season: t(`season.${tm.season}`, { year: tm.year }),
        fps: fpsTime > 1 ? Math.round(fpsFrames / fpsTime) : store.state.fps,
      });
      if (fpsTime > 1) fpsFrames = fpsTime = 0;
      uiTime = 0;
    }
  });

  store.set({ seed, layerCount: game.map.layers.length });
  render(h(Hud, {}), document.getElementById("ui")!);

  // Debug and test hook (spec 10, "Debug and test hooks").
  Object.assign(window, {
    __game: {
      game,
      camera,
      renderer,
      app,
      runTicks: (n: number) => {
        for (let i = 0; i < n; i++) game.step();
      },
      setSpeed: actions.setSpeed,
      setLayer: actions.setLayer,
      pause: () => (paused = true),
      ready: true,
    },
  });
}

boot().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML("beforeend", `<pre class="fatal">${String(e?.stack ?? e)}</pre>`);
});
