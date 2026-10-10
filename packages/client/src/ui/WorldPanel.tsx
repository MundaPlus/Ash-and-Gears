import { t } from "@wc/data";
import { useState } from "preact/hooks";
import { actions, useStore } from "./store.ts";

/** Biome colors on the world map. */
const BIOME_COLOR: Record<string, string> = {
  wastes: "#84603f",
  dead_forest: "#5c4636",
  ruined_city: "#6f8088",
  toxic_swamp: "#4f6b5a",
  mountains: "#3a2e26",
};
const SITE_ICON: Record<string, string> = { ruins: "R", bunker: "B", wreck_field: "W", dead_town: "T", crater_rim: "C" };
const CELL = 14;

/** World map (A8): sites around home, team picker, active expeditions. */
export function WorldPanel() {
  const s = useStore();
  const [siteId, setSite] = useState<number | null>(null);
  const [team, setTeam] = useState<number[]>([]);
  const [outpost, setOutpost] = useState(false);
  const w = s.world;
  if (!w) return <div class="menu worldmenu" data-testid="world-panel" />;
  const site = w.sites.find((x) => x.id === siteId) ?? null;
  const toggle = (id: number) => setTeam(team.includes(id) ? team.filter((x) => x !== id) : [...team, id]);
  return (
    <div class="menu worldmenu" data-testid="world-panel">
      <h3>{t("world.title")}</h3>
      <svg viewBox={`0 0 ${w.w * CELL} ${w.h * CELL}`} class="worldmap" role="img" aria-label={t("world.title")}>
        {w.biome.map((b, i) => (
          <rect key={i} x={(i % w.w) * CELL} y={Math.floor(i / w.w) * CELL} width={CELL} height={CELL} fill={BIOME_COLOR[b] ?? "#777"} />
        ))}
        <rect x={w.home.x * CELL + 2} y={w.home.y * CELL + 2} width={CELL - 4} height={CELL - 4} fill="#efd8a4" stroke="#1b1714" />
        {w.sites.map((x) => (
          <g key={x.id} class={`site ${x.id === siteId ? "on" : ""}`} data-testid={`site-${x.id}`} onClick={() => setSite(x.id)}>
            <circle cx={x.x * CELL + CELL / 2} cy={x.y * CELL + CELL / 2} r={CELL / 2 - 1} fill={x.outpost !== null ? "#9fd14a" : "#1b1714"} stroke={x.id === siteId ? "#efd8a4" : "#d9742e"} stroke-width={2} />
            <text x={x.x * CELL + CELL / 2} y={x.y * CELL + CELL / 2 + 4} text-anchor="middle" font-size="9" fill="#efd8a4">
              {SITE_ICON[x.kind]}
            </text>
          </g>
        ))}
      </svg>
      {site ? (
        <section>
          <h4>{t(`site.${site.kind}`)}</h4>
          <p class="hint">{t(`site.${site.kind}.desc`)}</p>
          <p>
            {t("world.travel", { h: site.travel })} · {t("world.danger", { n: Math.round(site.danger * 100) })} · {t("world.richness", { n: Math.round(site.richness * 100) })}
          </p>
          {site.outpost !== null && <p>{t("world.outpost_stock", { n: site.outpost })}</p>}
          <p class="hint">{t("world.supplies", { food: Math.ceil(site.food * Math.max(1, team.length)), water: Math.ceil(site.water * Math.max(1, team.length)) })}</p>
          <div class="team">
            {w.free.map((p) => (
              <label key={p.id}>
                <input type="checkbox" checked={team.includes(p.id)} onChange={() => toggle(p.id)} data-testid={`team-${p.id}`} /> {p.nick}
              </label>
            ))}
          </div>
          {site.outpost === null && (
            <label>
              <input type="checkbox" checked={outpost} onChange={() => setOutpost(!outpost)} /> {t("world.found_outpost", { cost: w.outpostCost.map((c) => `${c.n} ${t(`item.${c.item}`)}`).join(", ") })}
            </label>
          )}
          <button
            data-testid="send-expedition"
            disabled={!team.length}
            onClick={() => {
              actions.sendExpedition(site.id, team, outpost);
              setTeam([]);
              setOutpost(false);
            }}
          >
            {t("world.send")}
          </button>
          {w.problem && <p class="neg">{t(w.problem)}</p>}
        </section>
      ) : (
        <p class="hint">{t("world.pick_site")}</p>
      )}
      {w.expeditions.length > 0 && (
        <section>
          <h4>{t("world.away")}</h4>
          {w.expeditions.map((e) => (
            <p key={e.id}>
              {e.names.join(", ")} · {t(`site.${e.site}`)} · {t(`world.stage.${e.stage}`, { h: e.hoursLeft })}
            </p>
          ))}
        </section>
      )}
    </div>
  );
}
