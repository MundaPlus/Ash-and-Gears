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
  exposureAt,
  roomAt,
  tempAt,
  TICKS_PER_SECOND,
  type Pawn,
} from "@wc/sim";
import { ToolController } from "./input/tools.ts";
import * as sim from "@wc/sim";
import { Audio } from "./audio.ts";
import { listSlots, readSlot, writeSlot } from "./storage.ts";
import { TitleScreen } from "./ui/Screens.tsx";
import { Camera } from "./input/camera.ts";
import { PawnRenderer } from "./render/pawns.ts";
import { FxRenderer } from "./render/fx.ts";
import { DynamicRenderer } from "./render/dynamic.ts";
import { loadAiArt } from "./render/aiArt.ts";
import { ART_SIZES, makeTextures, TILE, type ArtSettings } from "./render/textures.ts";
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

/** Art settings: URL (?palette=ash&px=32) wins, then saved choice, then rust/16. */
function loadArt(params: URLSearchParams): ArtSettings {
  let saved: Partial<ArtSettings>;
  try {
    saved = JSON.parse(localStorage.getItem("wc-art") ?? "{}");
  } catch {
    saved = {};
  }
  const palette = params.get("palette") ?? saved.palette ?? "rust";
  const want = params.get("px") ?? saved.size ?? "16";
  const size = ART_SIZES.find((z) => z === want) ?? "16";
  return { palette, size };
}

/** Game options from the URL (new-game screen, tests). */
function optionsFromParams(params: URLSearchParams) {
  const num = (k: string, d: number) => (params.has(k) ? Number(params.get(k)) : d);
  const story = params.get("story");
  return {
    seed: params.get("seed") ?? Math.random().toString(36).slice(2, 8),
    mapSize: num("size", 200),
    dayLengthSec: num("day", 360),
    raidScale: num("raid", 1),
    mutantScale: num("mutant", 1),
    radCloudScale: num("rad", 1),
    storyteller: (story === "grandma" || story === "chaos" || story === "none" ? story : "sheriff") as "sheriff" | "grandma" | "chaos" | "none",
  };
}

async function boot() {
  const params = new URLSearchParams(location.search);
  const content = loadCoreContent();
  let game: Game;
  if (params.has("load")) {
    let slot: string | null;
    try {
      slot = sessionStorage.getItem("wc-load");
    } catch {
      slot = null;
    }
    const bytes = slot ? await readSlot(slot) : null;
    if (!bytes) {
      location.search = "";
      return;
    }
    game = sim.loadGame(content, await sim.unpackSave(bytes));
  } else if ([...params.keys()].some((k) => ["seed", "story", "new", "showcase"].includes(k))) {
    game = Game.create(content, optionsFromParams(params));
    if (params.has("showcase")) {
      sim.buildShowcase(game);
      game.rebuildDerived();
    }
  } else {
    // Title screen first.
    const slots = await listSlots();
    render(h(TitleScreen, { hasAutosave: slots.some((s) => s.id === "autosave") }), document.getElementById("ui")!);
    return;
  }
  const seed = game.opts.seed;

  const app = new Application();
  const host = document.getElementById("game")!;
  await app.init({ resizeTo: host, background: "#1b1714", antialias: false, autoDensity: true, resolution: Math.min(window.devicePixelRatio, 2) });
  host.appendChild(app.canvas);

  const art: ArtSettings = loadArt(params);
  const ai = await loadAiArt();
  let tex = makeTextures(game.reg, art, ai);
  const world = new Container();
  app.stage.addChild(world);
  const renderer = new WorldRenderer(game, tex);
  world.addChild(renderer.root);
  const dyn = new DynamicRenderer(game);
  world.addChild(dyn.gfx);
  const tools = new ToolController(game, world);
  const pawnsR = new PawnRenderer(game, tex);
  world.addChild(pawnsR.root);
  const fx = new FxRenderer(game);
  world.addChild(fx.gfx);
  const night = new Graphics();
  app.stage.addChild(night);
  app.stage.addChild(dyn.lights);
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
    const rot = tools.rotatable();
    store.set({ toolLabel: label ? `${label} · ${t("tool.hint")}${rot ? ` ${t("tool.rotate_hint")} ⟳` : ""}` : null, menu: null });
  };
  actions.rotateTool = (d) => {
    tools.rot = (tools.rot + d + 4) % 4;
    store.set({ toolRot: tools.rot });
  };
  actions.setArt = (patch) => {
    Object.assign(art, patch);
    try {
      localStorage.setItem("wc-art", JSON.stringify(art));
    } catch {
      // storage blocked: the setting lasts for this session only
    }
    tex = makeTextures(game.reg, art, ai);
    renderer.setTextures(tex);
    pawnsR.setTextures(tex);
    store.set({ art: { ...art } });
  };
  // ---------------------------------------------------------------- audio
  const audio = new Audio();
  let prefs: { music?: number; sfx?: number; ui?: number };
  try {
    prefs = JSON.parse(localStorage.getItem("wc-prefs") ?? "{}");
  } catch {
    prefs = {};
  }
  audio.volume = { music: prefs.music ?? 0.6, sfx: prefs.sfx ?? 0.7 };
  const savePrefs = () => {
    try {
      localStorage.setItem("wc-prefs", JSON.stringify({ ...audio.volume, ui: store.state.uiScale }));
    } catch {
      // storage blocked: settings last for this session
    }
  };
  const unlockAudio = () => audio.start();
  window.addEventListener("pointerdown", unlockAudio);
  window.addEventListener("keydown", unlockAudio);
  actions.setVolume = (k, v) => {
    audio.setVolume(k, v);
    store.set({ volume: { ...audio.volume } });
    savePrefs();
  };
  actions.setUiScale = (z) => {
    document.documentElement.style.setProperty("--ui-scale", String(z));
    store.set({ uiScale: z });
    savePrefs();
  };
  store.set({ volume: { ...audio.volume } });
  actions.setUiScale(prefs.ui ?? 1);

  // ---------------------------------------------------------------- saving
  const slotInfo = (id: string, name: string) => ({
    id,
    name,
    savedAt: new Date().toISOString(),
    day: game.time.day,
    colonists: [...game.pawns.values()].filter((p) => p.faction === "colony").length,
    seed: game.opts.seed,
  });
  actions.saveGame = async (name) => {
    const label = name ?? t("menu.slot_name", { day: game.time.day, seed: game.opts.seed });
    await writeSlot(slotInfo(`save-${Date.now()}`, label), await sim.packSave(sim.saveGame(game)));
    return label;
  };
  let autosaving = false;
  async function autosave() {
    if (autosaving) return;
    autosaving = true;
    try {
      await writeSlot(slotInfo("autosave", t("menu.autosave")), await sim.packSave(sim.saveGame(game)));
    } catch (e) {
      console.warn("autosave failed", e);
    } finally {
      autosaving = false;
    }
  }

  actions.setResearch = (id) => {
    sim.setResearch(game, id);
    store.set({ research: researchRows() });
  };
  actions.setFilter = (thingId, item) => {
    const th = game.things.get(thingId);
    if (th) sim.setFilter(game, th, item);
    if (inspected) inspectTile(inspected.x, inspected.y);
  };
  actions.setCrafterRecipe = (thingId, recipe) => {
    const th = game.things.get(thingId);
    if (th) sim.setCrafterRecipe(game, th, recipe);
    if (inspected) inspectTile(inspected.x, inspected.y);
  };

  function researchRows() {
    return game.reg.content.research.map((r) => ({
      id: r.id,
      tier: r.tier,
      state: sim.researchState(game, r.id),
      progress: game.research.done.has(r.id) ? 1 : (game.research.progress.get(r.id) ?? 0) / r.cost,
      cost: r.cost,
      prereqs: r.prereqs,
      blueprint: r.blueprint,
      current: game.research.current === r.id,
    }));
  }
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
    dyn.layer = n;
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
    if (room && !room.outdoor) {
      lines.push(t("inspect.room", { size: room.size }));
      // Shelter: roof progress, then how well it keeps radiation out.
      const exp = exposureAt(game, renderer.layer, x, y);
      lines.push(t(`inspect.shelter_${exp}`));
    } else lines.push(t("inspect.outdoors"));
    lines.push(t("inspect.temp", { v: Math.round(tempAt(game, renderer.layer, x, y)) }));
    const bp = L.blueprint[i] !== NO_THING ? game.blueprints.get(L.blueprint[i]) : undefined;
    if (bp) lines.push(t("inspect.blueprint", { name: t(bp.kind === "floor" ? `floor.${game.reg.floors.list[bp.def].id}` : `thing.${game.reg.things.list[bp.def].id}`) }));
    if (bp) {
      const need = Object.entries(bp.need).filter(([, n]) => n > 0).map(([k, n]) => `${n} × ${t(`item.${game.reg.items.list[Number(k)].id}`)}`);
      if (need.length) lines.push(t("inspect.needs", { list: need.join(", ") }));
    }
    if (L.desig[i]) lines.push(t("inspect.order", { name: t(`order.${DESIG_KINDS[L.desig[i] - 1]}`) }));
    let title = L.floor[i] ? t(`floor.${game.reg.floors.list[L.floor[i] - 1].id}`) : t(`terrain.${td.id}`);
    const th = L.thing[i];
    let bills: { benchId: number; recipe: string; target: number; stock: number }[] | undefined;
    let crafter: { thingId: number; current: string | null; options: string[] } | undefined;
    let filter: { thingId: number; current: string | null; options: string[] } | undefined;
    if (th !== NO_THING) {
      const thing = game.things.get(th)!;
      const def = game.reg.things.list[thing.def];
      title = `${t(`thing.${def.id}`)} · ${title}`;
      lines.push(t("inspect.hp", { hp: thing.hp, max: def.hp }));
      if (def.crop) lines.push(t("inspect.growth", { v: Math.round((thing.growth ?? 0) * 100) }));
      if ((thing.contamUntil ?? 0) > game.tick) lines.push(t("inspect.contaminated"));
      if (def.bench)
        bills = recipesFor(game, def.id).map((r) => ({ benchId: thing.id, recipe: r.id, target: billTarget(game, thing, r), stock: stockOf(game, r) }));
      if (def.power) {
        const p = def.power;
        if (p.fuel) lines.push(t("inspect.fuel", { v: Math.round(thing.fuel ?? 0), max: p.fuel.capacity, item: t(`item.${p.fuel.item}`) }));
        if (p.store) lines.push(t("inspect.charge", { v: Math.round(thing.charge ?? 0), max: p.store }));
        if (p.use) lines.push(sim.isPowered(game, thing) ? t("inspect.powered", { w: p.use }) : t("inspect.unpowered", { w: p.use }));
        const net = game.nets[game.netOf.get(thing.id) ?? -1];
        if (net) lines.push(t("inspect.net", { produce: Math.round(net.produce), use: Math.round(net.use), stored: Math.round(net.stored) }));
      }
      if (def.autoCrafter) {
        const r = sim.crafterRecipe(game, thing);
        crafter = { thingId: thing.id, current: r?.id ?? null, options: recipesFor(game, def.id).filter((x) => x.inputs.every((i) => i.item)).map((x) => x.id) };
        if (r) lines.push(t("inspect.crafter", { have: r.inputs.map((i) => `${thing.buffer?.[game.reg.items.idx(i.item!)] ?? 0}/${i.count} ${t(`item.${i.item}`)}`).join(", "), pct: Math.round(((thing.work ?? 0) / r.work) * 100) }));
      }
      const contents = (r?: Record<number, number>) =>
        Object.entries(r ?? {}).filter(([, n]) => n > 0).map(([k, n]) => `${n} × ${t(`item.${game.reg.items.list[Number(k)].id}`)}`).join(", ");
      if (def.chest) {
        const inside: Record<number, number> = {};
        for (const st of sim.chestStacks(game, thing)) inside[st.def] = (inside[st.def] ?? 0) + st.count;
        lines.push(`${t("chest.title")} (${sim.chestCount(game, thing)}/${def.chest}): ${contents(inside) || t("chest.empty")}`);
      }
      if (def.autoCrafter && contents(thing.out)) lines.push(`${t("chest.title")}: ${contents(thing.out)}`);
      if (def.pipe || (def.fluid && def.fluid.role !== "purifier")) {
        const net = sim.fluidNetOf(game, thing);
        if (net)
          lines.push(t("inspect.fluids", { water: Math.round(sim.netAmount(game, net, "water")), clean: Math.round(sim.netAmount(game, net, "clean_water")), room: Math.round(sim.netRoom(game, net)) }));
        if (def.fluid?.role === "pump" && !sim.pumpSource(game, thing)) lines.push(t("inspect.pump_dry"));
      }
      if (def.fluid?.role === "purifier") {
        const r = thing.rot ?? 0;
        lines.push(t("bench.sides", { in: t(`dir.${(r + 3) % 4}`), out: t(`dir.${(r + 1) % 4}`) }));
      }
      if (def.bench) {
        // Directions: 0 east, 1 south, 2 west, 3 north. Output side is south when not turned.
        const r = thing.rot ?? 0;
        lines.push(t("bench.sides", { in: t(`dir.${(r + 3) % 4}`), out: t(`dir.${(r + 1) % 4}`) }));
        if (contents(thing.buffer)) lines.push(t("bench.buffer", { list: contents(thing.buffer) }));
        if (contents(thing.out)) lines.push(t("bench.out", { list: contents(thing.out) }));
      }
      if (def.arm || def.beltKind === "sort")
        filter = {
          thingId: thing.id,
          current: thing.filter !== undefined ? game.reg.items.list[thing.filter].id : null,
          options: game.reg.items.list.filter((d) => d.id !== "corpse").map((d) => d.id),
        };
    }
    inspected = { x, y };
    const it = L.item[i];
    if (it !== NO_THING) {
      const st = game.items.get(it)!;
      const name = t(`item.${game.reg.items.list[st.def].id}`);
      lines.push(t("inspect.items", { count: st.count, item: st.contaminated ? `${name} (${t("item.contaminated")})` : name }));
    }
    store.set({ inspect: { title, lines, bills, crafter, filter } });
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
    ...game.reg.things.list.filter((d) => d.build).map((d) => ({ defKind: "thing" as const, def: d.id, menu: d.build!.menu, cost: Object.entries(d.build!.cost).map(([item, n]) => ({ item, n })), locked: d.build!.research ?? null, rotatable: d.rotatable })),
    ...game.reg.floors.list.map((d) => ({ defKind: "floor" as const, def: d.id, menu: "floor", cost: Object.entries(d.build.cost).map(([item, n]) => ({ item, n })), locked: null, rotatable: false })),
  ];
  const buildRows = () => buildOptions.map((o) => ({ ...o, locked: o.locked && !game.research.done.has(o.locked) ? o.locked : null }));

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
  /** Frame capture for trailers: no auto-pause. */
  let capturing = false;
  let toastId = 0;
  function drainMessages(now: number) {
    const fresh = game.messages.filter((m) => m.tick > msgSeen);
    if (game.messages.length) msgSeen = game.messages[game.messages.length - 1].tick;
    let toasts = store.state.toasts.filter((x) => x.until > now);
    for (const m of fresh) {
      if (AUTO_PAUSE.has(m.key) && !capturing) paused = true;
      if (m.key === "msg.research_done" || m.key.startsWith("goal.")) audio.play("done");
      else if (m.level === "bad") audio.play("bad");
      else if (m.level === "warn") audio.play("alert", 0.7);
      const params = { ...m.params };
      if (m.key === "msg.skill_up") params.skill = t(`skill.${params.skill}`);
      if (typeof params.item === "string") params.item = t(`item.${params.item}`);
      if (typeof params.thing === "string") params.thing = t(`thing.${params.thing}`);
      if (typeof params.part === "string") params.part = t(`part.${params.part}`);
      if (typeof params.cause === "string") params.cause = t(`cause.${params.cause}`);
      if (typeof params.project === "string") params.project = t(`research.${params.project}`);
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
    else if ((e.key === "q" || e.key === "e") && tools.spec) actions.rotateTool(e.key === "e" ? 1 : -1);
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

  let fpsFrames = 0, fpsTime = 0, uiTime = 0, clock = 0, lastFxTick = game.tick;
  /** One frame: sim ticks for the elapsed time, camera, renderers, audio, UI. */
  function frame(deltaMS: number) {
    const dt = Math.min(deltaMS, 250) / 1000;
    clock += dt;
    if (!paused) {
      acc += dt * TICKS_PER_SECOND * speed;
      let n = Math.min(Math.floor(acc), MAX_TICKS_PER_FRAME * speed);
      acc -= Math.floor(acc);
      while (n-- > 0) {
        game.step();
        if (game.tick % game.ticksPerDay === 0) void autosave();
      }
    }
    camera.update(dt);
    renderer.update(camera.view, camera.zoom);
    pawnsR.update(clock, camera.zoom);
    fx.update(clock, camera.view);
    dyn.update(clock, camera.view, renderer.layer > 0 ? 0.6 : darkness(game.hourOfDay), (x, y) => ({ x: x * camera.zoom + world.position.x, y: y * camera.zoom + world.position.y }), camera.zoom);

    // Night: underground is always dim, the surface follows the clock.
    const dark = renderer.layer > 0 ? 0.35 : darkness(game.hourOfDay) * 0.55;
    night.clear();
    if (dark > 0.01) night.rect(0, 0, app.screen.width, app.screen.height).fill({ color: 0x0b1020, alpha: dark });
    // Weather on the surface: a pulsing green haze for the radiation cloud, falling streaks for rain.
    weatherFx.clear();
    const wk = game.weather.kind;
    if (renderer.layer === 0 && (wk === "rad_cloud" || wk === "toxic_rain"))
      weatherFx.rect(0, 0, app.screen.width, app.screen.height).fill({ color: 0x9fd14a, alpha: (wk === "rad_cloud" ? 0.13 : 0.06) + 0.05 * Math.sin(clock * 1.5) });
    if (renderer.layer === 0 && (wk === "rain" || wk === "rad_cloud" || wk === "toxic_rain")) {
      const W = app.screen.width, H = app.screen.height;
      for (const d of drops) {
        d[1] = (d[1] + dt * d[2] * (paused ? 0 : 1.6)) % 1;
        const x = d[0] * W, y = d[1] * H;
        weatherFx.moveTo(x, y).lineTo(x - 4, y + 14);
      }
      weatherFx.stroke({ width: 1, color: wk === "rain" ? 0xa8c0d0 : 0xc6ff3a, alpha: 0.45 });
    }

    // Audio: music mood from the situation, sound effects from new combat events and messages.
    const hostiles = [...game.pawns.values()].some((p) => p.faction !== "colony" && !p.health.downed);
    const recentFight = game.fx.some((f) => game.tick - f.tick < 120);
    audio.mood = hostiles && recentFight ? "combat" : hostiles || game.weather.kind === "rad_cloud" || game.weather.next?.kind === "rad_cloud" ? "tense" : darkness(game.hourOfDay) > 0.5 ? "night" : "calm";
    audio.tier = Math.max(0, ...game.reg.content.research.filter((r) => game.research.done.has(r.id)).map((r) => r.tier));
    audio.day = game.time.day;
    audio.update();
    const v = camera.view;
    for (const f of game.fx) {
      if (f.tick <= lastFxTick || f.layer !== renderer.layer) continue;
      const fx0 = (f.from.x + 0.5) * TILE, fy0 = (f.from.y + 0.5) * TILE;
      const cx = v.x + v.w / 2, cy = v.y + v.h / 2;
      const dist = Math.hypot(fx0 - cx, fy0 - cy) / Math.max(v.w, v.h);
      const vol = Math.max(0, 1 - dist * 1.2);
      const pan = (fx0 - cx) / (v.w / 2);
      audio.play(f.kind === "melee" ? "melee" : f.kind === "turret" ? "turret" : "shot", vol, pan);
      if (f.hit) audio.play("hit", vol * 0.8, pan);
    }
    if (game.fx.length) lastFxTick = game.fx[game.fx.length - 1].tick;
    if (game.weather.kind === "rad_cloud" && renderer.layer === 0 && !paused && Math.random() < 0.25 * speed) audio.play("geiger", 0.5, Math.random() * 2 - 1);
    // Work sounds for survivors on screen.
    if (!paused && Math.random() < 0.08 * speed) {
      for (const p of game.pawns.values()) {
        const task = p.job?.kind === "work" && p.job.stage === 2 ? (p.job.data?.task as string) : null;
        if (!task || p.layer !== renderer.layer) continue;
        const px = (p.x + 0.5) * TILE, py = (p.y + 0.5) * TILE;
        if (px < v.x || py < v.y || px > v.x + v.w || py > v.y + v.h) continue;
        audio.play(task === "mine" || task === "clear" ? "pick" : "hammer", 0.35, (px - (v.x + v.w / 2)) / (v.w / 2));
        break;
      }
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
        goals: sim.GOALS.map((id) => ({ id, done: !!game.goals[id] })),
        goalHint: (() => {
          const next = sim.GOALS.find((id) => !game.goals[id]);
          return next ? sim.goalHint(game, next) : null;
        })(),
        radWarning: game.weather.next?.kind === "rad_cloud" ? Math.max(0, Math.ceil((game.weather.next.at - game.tick) / game.ticksPerHour)) : null,
        fps: fpsTime > 1 ? Math.round(fpsFrames / fpsTime) : store.state.fps,
        colonists: colonists(),
        ...(store.state.menu === "work" ? { workRows: workRows() } : {}),
        ...(store.state.menu === "research" ? { research: researchRows() } : {}),
        ...(store.state.menu === "build" ? { buildOptions: buildRows() } : {}),
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
  }
  app.ticker.add((tk) => frame(tk.deltaMS));
  if (params.has("cinematic")) document.body.classList.add("cinematic");

  store.set({ art: { ...art } });
  store.set({ seed, layerCount: game.map.layers.length, buildOptions: buildRows(), workTypes: activeWorkTypes(), workRows: workRows(), research: researchRows() });
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
      audio,
      autosave,
      /** Frame capture: stop the live loop, then step and render one frame at a time. */
      capture: () => {
        capturing = true;
        app.ticker.stop();
      },
      frame: (ms: number) => {
        frame(ms);
        app.render();
      },
      ready: true,
    },
  });
}

boot().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML("beforeend", `<pre class="fatal">${String(e?.stack ?? e)}</pre>`);
});
