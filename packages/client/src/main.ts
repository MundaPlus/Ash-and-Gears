import { Application, Container, Graphics } from "pixi.js";
import { h, render } from "preact";
import { loadCoreContent, t } from "@wc/data";
import { countItems, Game, moodTarget, NEEDS, NO_THING, pawnName, TICKS_PER_SECOND, type Pawn } from "@wc/sim";
import { Camera } from "./input/camera.ts";
import { PawnRenderer } from "./render/pawns.ts";
import { makePlaceholderTextures, TILE } from "./render/textures.ts";
import { WorldRenderer } from "./render/world.ts";
import { Hud } from "./ui/Hud.tsx";
import { actions, store, type ColonistSummary, type PawnDetail } from "./ui/store.ts";

/** Most sim ticks per frame, so a slow frame cannot snowball. */
const MAX_TICKS_PER_FRAME = 12;
const TOAST_SEC = 7;

const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

/** Darkness 0..1 by hour: full day 7-18, night 21-4, smooth dusk and dawn. */
function darkness(hour: number): number {
  if (hour >= 7 && hour < 18) return 0;
  if (hour >= 21 || hour < 4) return 1;
  if (hour >= 18) return (hour - 18) / 3;
  return 1 - (hour - 4) / 3;
}

async function boot() {
  const params = new URLSearchParams(location.search);
  const seed = params.get("seed") ?? Math.random().toString(36).slice(2, 8);
  const mapSize = Number(params.get("size") ?? 200);
  const game = Game.create(loadCoreContent(), { seed, mapSize });

  const app = new Application();
  const host = document.getElementById("game")!;
  await app.init({ resizeTo: host, background: "#1b1714", antialias: false, autoDensity: true, resolution: Math.min(window.devicePixelRatio, 2) });
  host.appendChild(app.canvas);

  const tex = makePlaceholderTextures(game.reg);
  const world = new Container();
  app.stage.addChild(world);
  const renderer = new WorldRenderer(game, tex);
  world.addChild(renderer.root);
  const pawnsR = new PawnRenderer(game, tex);
  world.addChild(pawnsR.root);
  const night = new Graphics();
  app.stage.addChild(night);

  const camera = new Camera(app.canvas, world, { w: game.map.w * TILE, h: game.map.h * TILE });
  camera.centerOn((game.home.x + 0.5) * TILE, (game.home.y + 0.5) * TILE);
  camera.zoom = 1.5;

  let speed = 1;
  let paused = false;
  let acc = 0;
  let selected: number | null = null;

  actions.setSpeed = (s) => {
    speed = s;
    paused = false;
  };
  actions.togglePause = () => (paused = !paused);
  actions.setLayer = (l) => {
    const n = Math.max(0, Math.min(game.map.layers.length - 1, l));
    renderer.setLayer(n);
    pawnsR.layer = n;
    store.set({ layer: n, inspect: null });
  };
  actions.selectPawn = (id, center) => {
    selected = id;
    pawnsR.selected = id;
    const p = id !== null ? game.pawns.get(id) : undefined;
    if (p && center) {
      if (p.layer !== renderer.layer) actions.setLayer(p.layer);
      const pos = PawnRenderer.worldPos(p);
      camera.centerOn(pos.x, pos.y);
    }
    store.set({ pawn: p ? pawnDetail(p) : null, inspect: null });
  };

  camera.onTap = (wx, wy) => {
    const p = pawnsR.pick(wx, wy);
    if (p) return actions.selectPawn(p.id);
    actions.selectPawn(null);
    inspectTile(Math.floor(wx / TILE), Math.floor(wy / TILE));
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
    const it = L.item[i];
    if (it !== NO_THING) {
      const st = game.items.get(it)!;
      const name = t(`item.${game.reg.items.list[st.def].id}`);
      lines.push(t("inspect.items", { count: st.count, item: st.contaminated ? `${name} (${t("item.contaminated")})` : name }));
    }
    store.set({ inspect: { title, lines } });
  }

  const jobKey = (p: Pawn) => (p.mentalBreak ? "sulk" : (p.job?.kind ?? "none"));

  function pawnDetail(p: Pawn): PawnDetail {
    const thoughts = [
      ...p.situational.map((ti) => game.reg.thoughts.list[ti]),
      ...p.memories.map((m) => game.reg.thoughts.list[m.thought]),
    ].map((d) => ({ id: d.id, mood: d.mood }));
    for (const ti of p.traits) {
      const tr = game.reg.traits.list[ti];
      if (tr.mood) thoughts.push({ id: `trait_${tr.id}`, mood: tr.mood });
    }
    return {
      id: p.id,
      name: pawnName(p),
      age: p.age,
      color: hex(PawnRenderer.colorOf(p)),
      mood: Math.round(p.mood),
      moodTarget: Math.round(moodTarget(game, p)),
      job: jobKey(p),
      needs: NEEDS.map((n) => ({ id: n, value: p.needs[n] })),
      skills: game.reg.skills.list.map((s, i) => ({ id: s.id, level: p.skills[i].level, passion: p.skills[i].passion })),
      traits: p.traits.map((ti) => game.reg.traits.list[ti].id),
      thoughts: thoughts.filter((th) => !th.id.startsWith("trait_")),
    };
  }

  function colonists(): ColonistSummary[] {
    return [...game.pawns.values()].map((p) => {
      const worst = p.situational.map((ti) => game.reg.thoughts.list[ti]).sort((a, b) => a.mood - b.mood)[0];
      return { id: p.id, nick: p.nick, mood: Math.round(p.mood), color: hex(PawnRenderer.colorOf(p)), job: jobKey(p), warn: worst?.id ?? null };
    });
  }

  let msgSeen = 0;
  let toastId = 0;
  function drainMessages(now: number) {
    const fresh = game.messages.filter((m) => m.tick > msgSeen);
    if (game.messages.length) msgSeen = game.messages[game.messages.length - 1].tick;
    let toasts = store.state.toasts.filter((x) => x.until > now);
    for (const m of fresh) {
      const params = { ...m.params };
      if (m.key === "msg.skill_up") params.skill = t(`skill.${params.skill}`);
      toasts.push({ id: toastId++, text: t(m.key, params), level: m.level, until: now + TOAST_SEC });
    }
    toasts = toasts.slice(-4);
    if (fresh.length || toasts.length !== store.state.toasts.length) store.set({ toasts });
  }

  window.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.key === " ") {
      e.preventDefault();
      actions.togglePause();
    } else if (e.key === "1" || e.key === "2" || e.key === "3") actions.setSpeed(Number(e.key));
    else if (e.key === "PageUp") actions.setLayer(renderer.layer - 1);
    else if (e.key === "PageDown") actions.setLayer(renderer.layer + 1);
    else if (e.key === "Escape") actions.closeInspect();
  });

  let fpsFrames = 0, fpsTime = 0, uiTime = 0, clock = 0;
  app.ticker.add((tk) => {
    const dt = Math.min(tk.deltaMS, 250) / 1000;
    clock += dt;
    if (!paused) {
      acc += dt * TICKS_PER_SECOND * speed;
      let n = Math.min(Math.floor(acc), MAX_TICKS_PER_FRAME * speed);
      acc -= Math.floor(acc);
      while (n-- > 0) game.step();
    }
    camera.update(dt);
    renderer.update(camera.view, camera.zoom);
    pawnsR.update(clock, camera.zoom);

    // Night: underground is always dim, the surface follows the clock.
    const dark = renderer.layer > 0 ? 0.35 : darkness(game.hourOfDay) * 0.55;
    night.clear();
    if (dark > 0.01) night.rect(0, 0, app.screen.width, app.screen.height).fill({ color: 0x0b1020, alpha: dark });

    fpsFrames++;
    fpsTime += dt;
    uiTime += dt;
    if (uiTime > 0.2) {
      const tm = game.time;
      const pad = (v: number) => String(v).padStart(2, "0");
      const sel = selected !== null ? game.pawns.get(selected) : undefined;
      store.set({
        speed,
        paused,
        clock: t("clock", { day: tm.day, hh: pad(tm.hour), mm: pad(tm.minute) }),
        season: t(`season.${tm.season}`, { year: tm.year }),
        fps: fpsTime > 1 ? Math.round(fpsFrames / fpsTime) : store.state.fps,
        colonists: colonists(),
        pawn: sel ? pawnDetail(sel) : null,
        resources: [
          { id: "food", count: countItems(game, "canned_food") },
          { id: "water", count: countItems(game, "clean_water") + countItems(game, "dirty_water") },
          { id: "scrap", count: countItems(game, "scrap") },
          { id: "wood", count: countItems(game, "wood") },
        ],
      });
      drainMessages(clock);
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
      pawns: pawnsR,
      app,
      runTicks: (n: number) => {
        for (let i = 0; i < n; i++) game.step();
      },
      setSpeed: actions.setSpeed,
      setLayer: actions.setLayer,
      selectPawn: actions.selectPawn,
      pause: () => (paused = true),
      ready: true,
    },
  });
}

boot().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML("beforeend", `<pre class="fatal">${String(e?.stack ?? e)}</pre>`);
});
