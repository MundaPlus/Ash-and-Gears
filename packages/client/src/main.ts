import { Application, Container, Graphics } from "pixi.js";
import { h, render } from "preact";
import { loadCoreContent, t } from "@wc/data";
import {
  activeWorkTypes,
  billTarget,
  recipesFor,
  setBillTarget,
  stockOf,
  countItems,
  DESIG_KINDS,
  Game,
  moodTarget,
  NEEDS,
  NO_THING,
  pawnName,
  roomAt,
  tempAt,
  TICKS_PER_SECOND,
  type Pawn,
} from "@wc/sim";
import { ToolController } from "./input/tools.ts";
import * as sim from "@wc/sim";
import { Camera } from "./input/camera.ts";
import { PawnRenderer } from "./render/pawns.ts";
import { FxRenderer } from "./render/fx.ts";
import { makePlaceholderTextures, TILE } from "./render/textures.ts";
import { WorldRenderer } from "./render/world.ts";
import { Hud } from "./ui/Hud.tsx";
import { actions, store, type BuildOption, type ColonistSummary, type PawnDetail, type WorkRow } from "./ui/store.ts";

/** Most sim ticks per frame, so a slow frame cannot snowball. */
const MAX_TICKS_PER_FRAME = 12;
const TOAST_SEC = 7;
/** Big events pause the game so the player can react (spec 06). */
const AUTO_PAUSE = new Set(["msg.raid", "msg.glow_hounds", "msg.rad_rats", "msg.rad_warning", "msg.downed", "msg.died"]);

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
  const tools = new ToolController(game, world);
  const pawnsR = new PawnRenderer(game, tex);
  world.addChild(pawnsR.root);
  const fx = new FxRenderer(game);
  world.addChild(fx.gfx);
  const night = new Graphics();
  app.stage.addChild(night);
  const weatherFx = new Graphics();
  app.stage.addChild(weatherFx);
  /** Rain drops in screen space: x, y, speed. */
  const drops = Array.from({ length: 140 }, () => [Math.random(), Math.random(), 0.6 + Math.random() * 0.6]);

  const camera = new Camera(app.canvas, world, { w: game.map.w * TILE, h: game.map.h * TILE });
  camera.centerOn((game.home.x + 0.5) * TILE, (game.home.y + 0.5) * TILE);
  camera.zoom = 1.5;
  camera.onRightClick = (wx, wy) => {
    if (tools.spec) return actions.setTool(null);
    orderAt(wx, wy);
  };

  /** Drafted survivor selected: tap an enemy to attack it, tap ground to move. Returns true if an order was given. */
  function orderAt(wx: number, wy: number): boolean {
    const sel = selected !== null ? game.pawns.get(selected) : undefined;
    if (!sel || sel.faction !== "colony" || !sel.drafted) return false;
    const target = pawnsR.pick(wx, wy);
    if (target && target.faction !== "colony") {
      sim.orderAttack(game, sel, target);
      return true;
    }
    if (target) return false;
    const x = Math.floor(wx / TILE), y = Math.floor(wy / TILE);
    if (!game.walkable(renderer.layer, x, y)) return false;
    sim.orderMove(game, sel, { layer: renderer.layer, x, y });
    return true;
  }

  actions.setTool = (spec) => {
    tools.set(spec);
    camera.tool = spec ? tools : null;
    let label: string | null = null;
    if (spec?.kind === "build") label = t("tool.build", { name: t(spec.defKind === "floor" ? `floor.${spec.def}` : `thing.${spec.def}`) });
    else if (spec?.kind === "order") label = t("tool.order", { name: t(`order.${spec.desig}`) });
    else if (spec?.kind === "cancel") label = t("tool.cancel");
    else if (spec?.kind === "zone" && spec.zone === "grow") label = t("tool.zone", { name: t("zone.grow", { crop: t(`thing.${spec.crop}`) }) });
    else if (spec?.kind === "zone") label = t("tool.zone", { name: t(`zone.${spec.zone}`) });
    store.set({ toolLabel: label ? `${label} · ${t("tool.hint")}` : null, menu: null });
  };
  actions.toggleDraft = (id) => {
    const p = game.pawns.get(id);
    if (p) sim.setDrafted(game, p, !p.drafted);
  };
  actions.draftAll = () => {
    const cols = [...game.pawns.values()].filter((p) => p.faction === "colony" && !p.health.downed);
    const on = cols.some((p) => !p.drafted);
    for (const p of cols) sim.setDrafted(game, p, on);
  };
  actions.setWork = (id, work, value) => {
    const p = game.pawns.get(id);
    if (p) p.work[work] = value;
    store.set({ workRows: workRows() });
  };

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
    fx.layer = n;
    tools.layer = n;
    tools.cancel();
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
    if (orderAt(wx, wy)) return;
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
    const room = roomAt(game, renderer.layer, x, y);
    lines.push(room && !room.outdoor ? t("inspect.room", { size: room.size }) : t("inspect.outdoors"));
    lines.push(t("inspect.temp", { v: Math.round(tempAt(game, renderer.layer, x, y)) }));
    const bp = L.blueprint[i] !== NO_THING ? game.blueprints.get(L.blueprint[i]) : undefined;
    if (bp) lines.push(t("inspect.blueprint", { name: t(bp.kind === "floor" ? `floor.${game.reg.floors.list[bp.def].id}` : `thing.${game.reg.things.list[bp.def].id}`) }));
    if (L.desig[i]) lines.push(t("inspect.order", { name: t(`order.${DESIG_KINDS[L.desig[i] - 1]}`) }));
    let title = t(`terrain.${td.id}`);
    const th = L.thing[i];
    let bills: { benchId: number; recipe: string; target: number; stock: number }[] | undefined;
    if (th !== NO_THING) {
      const thing = game.things.get(th)!;
      const def = game.reg.things.list[thing.def];
      title = `${t(`thing.${def.id}`)} · ${title}`;
      lines.push(t("inspect.hp", { hp: thing.hp, max: def.hp }));
      if (def.crop) lines.push(t("inspect.growth", { v: Math.round((thing.growth ?? 0) * 100) }));
      if ((thing.contamUntil ?? 0) > game.tick) lines.push(t("inspect.contaminated"));
      if (def.bench)
        bills = recipesFor(game, def.id).map((r) => ({ benchId: thing.id, recipe: r.id, target: billTarget(game, thing, r), stock: stockOf(game, r) }));
    }
    inspected = { x, y };
    const it = L.item[i];
    if (it !== NO_THING) {
      const st = game.items.get(it)!;
      const name = t(`item.${game.reg.items.list[st.def].id}`);
      lines.push(t("inspect.items", { count: st.count, item: st.contaminated ? `${name} (${t("item.contaminated")})` : name }));
    }
    store.set({ inspect: { title, lines, bills } });
  }
  let inspected: { x: number; y: number } | null = null;
  actions.setBillTarget = (benchId, recipe, n) => {
    setBillTarget(game, benchId, recipe, n);
    if (inspected) inspectTile(inspected.x, inspected.y);
  };

  const jobKey = (p: Pawn) =>
    p.mentalBreak ? "job.sulk" : p.job?.kind === "work" ? `task.${p.job.data!.task}` : `job.${p.job?.kind ?? "none"}`;

  function workRows(): WorkRow[] {
    return [...game.pawns.values()].map((p) => ({
      id: p.id,
      nick: p.nick,
      color: hex(PawnRenderer.colorOf(p)),
      work: { ...p.work },
      skills: Object.fromEntries(game.reg.skills.list.map((s, i) => [s.id, p.skills[i].level])),
    }));
  }

  const buildOptions: BuildOption[] = [
    ...game.reg.things.list.filter((d) => d.build).map((d) => ({ defKind: "thing" as const, def: d.id, menu: d.build!.menu, cost: Object.entries(d.build!.cost).map(([item, n]) => ({ item, n })) })),
    ...game.reg.floors.list.map((d) => ({ defKind: "floor" as const, def: d.id, menu: "floor", cost: Object.entries(d.build.cost).map(([item, n]) => ({ item, n })) })),
  ];

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
      rad: p.rad,
      faction: p.faction,
      drafted: p.drafted,
      downed: p.health.downed,
      weapon: p.weapon !== null ? game.reg.items.list[p.weapon].id : null,
      bloodLoss: p.health.bloodLoss,
      pain: sim.pain(game, p),
      injuries: p.health.injuries.map((i) => ({ part: i.part, kind: i.kind, dmg: Math.round(i.dmg), tended: i.tended > 0 })),
      missing: [...p.health.missing],
      skills: game.reg.skills.list.map((s, i) => ({ id: s.id, level: p.skills[i].level, passion: p.skills[i].passion })),
      traits: p.traits.map((ti) => game.reg.traits.list[ti].id),
      thoughts: thoughts.filter((th) => !th.id.startsWith("trait_")),
    };
  }

  function colonists(): ColonistSummary[] {
    return [...game.pawns.values()].filter((p) => p.faction === "colony").map((p) => {
      const worst = p.situational.map((ti) => game.reg.thoughts.list[ti]).sort((a, b) => a.mood - b.mood)[0];
      const warn = p.health.downed ? "downed" : p.drafted ? "drafted" : (worst?.id ?? null);
      return { id: p.id, nick: p.nick, mood: Math.round(p.mood), color: hex(PawnRenderer.colorOf(p)), job: jobKey(p), warn };
    });
  }

  let msgSeen = 0;
  let toastId = 0;
  function drainMessages(now: number) {
    const fresh = game.messages.filter((m) => m.tick > msgSeen);
    if (game.messages.length) msgSeen = game.messages[game.messages.length - 1].tick;
    let toasts = store.state.toasts.filter((x) => x.until > now);
    for (const m of fresh) {
      if (AUTO_PAUSE.has(m.key)) paused = true;
      const params = { ...m.params };
      if (m.key === "msg.skill_up") params.skill = t(`skill.${params.skill}`);
      if (typeof params.item === "string") params.item = t(`item.${params.item}`);
      if (typeof params.thing === "string") params.thing = t(`thing.${params.thing}`);
      if (typeof params.part === "string") params.part = t(`part.${params.part}`);
      if (typeof params.cause === "string") params.cause = t(`cause.${params.cause}`);
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
    else if (e.key === "r" || e.key === "R") {
      if (selected !== null) actions.toggleDraft(selected);
    } else if (e.key === "PageUp") actions.setLayer(renderer.layer - 1);
    else if (e.key === "PageDown") actions.setLayer(renderer.layer + 1);
    else if (e.key === "Escape") {
      if (tools.spec) actions.setTool(null);
      else if (store.state.menu) actions.openMenu(null);
      else actions.closeInspect();
    }
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
    fx.update(clock, camera.view);

    // Night: underground is always dim, the surface follows the clock.
    const dark = renderer.layer > 0 ? 0.35 : darkness(game.hourOfDay) * 0.55;
    night.clear();
    if (dark > 0.01) night.rect(0, 0, app.screen.width, app.screen.height).fill({ color: 0x0b1020, alpha: dark });
    // Weather on the surface: a pulsing green haze for the radiation cloud, falling streaks for rain.
    weatherFx.clear();
    const wk = game.weather.kind;
    if (renderer.layer === 0 && wk === "rad_cloud")
      weatherFx.rect(0, 0, app.screen.width, app.screen.height).fill({ color: 0x9fd14a, alpha: 0.13 + 0.05 * Math.sin(clock * 1.5) });
    if (renderer.layer === 0 && (wk === "rain" || wk === "rad_cloud")) {
      const W = app.screen.width, H = app.screen.height;
      for (const d of drops) {
        d[1] = (d[1] + dt * d[2] * (paused ? 0 : 1.6)) % 1;
        const x = d[0] * W, y = d[1] * H;
        weatherFx.moveTo(x, y).lineTo(x - 4, y + 14);
      }
      weatherFx.stroke({ width: 1, color: wk === "rain" ? 0xa8c0d0 : 0xc6ff3a, alpha: 0.45 });
    }

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
        weather: game.weather.kind,
        radWarning: game.weather.next?.kind === "rad_cloud" ? Math.max(0, Math.ceil((game.weather.next.at - game.tick) / game.ticksPerHour)) : null,
        fps: fpsTime > 1 ? Math.round(fpsFrames / fpsTime) : store.state.fps,
        colonists: colonists(),
        ...(store.state.menu === "work" ? { workRows: workRows() } : {}),
        pawn: sel ? pawnDetail(sel) : null,
        resources: [
          { id: "meals", count: countItems(game, "simple_meal") },
          { id: "food", count: countItems(game, "canned_food") },
          { id: "raw", count: game.reg.items.list.filter((d) => d.raw).reduce((n, d) => n + countItems(game, d.id), 0) },
          { id: "water", count: countItems(game, "clean_water") + countItems(game, "dirty_water") },
          { id: "scrap", count: countItems(game, "scrap") },
          { id: "wood", count: countItems(game, "wood") },
          { id: "stone", count: countItems(game, "stone") },
        ],
      });
      drainMessages(clock);
      if (fpsTime > 1) fpsFrames = fpsTime = 0;
      uiTime = 0;
    }
  });

  store.set({ seed, layerCount: game.map.layers.length, buildOptions, workTypes: activeWorkTypes(), workRows: workRows() });
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
      setTool: actions.setTool,
      sim,
      pause: () => (paused = true),
      ready: true,
    },
  });
}

boot().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML("beforeend", `<pre class="fatal">${String(e?.stack ?? e)}</pre>`);
});
