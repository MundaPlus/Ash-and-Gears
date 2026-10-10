import { t } from "@wc/data";
import { useState } from "preact/hooks";
import { actions, useStore } from "./store.ts";

/** Trade with a caravan (A9): pick what to buy and sell; they want value × markup back. */
export function TradePanel() {
  const s = useStore();
  const [buy, setBuy] = useState<Record<string, number>>({});
  const [sell, setSell] = useState<Record<string, number>>({});
  const c = s.caravan!;
  const value = (r: Record<string, number>) => Object.entries(r).reduce((a, [id, n]) => a + (c.rows.find((x) => x.id === id)?.value ?? 0) * n, 0);
  const step = (row: { yours: number; theirs: number }, side: "buy" | "sell", d: number) => {
    const max = side === "buy" ? row.theirs : row.yours;
    return (cur: number) => Math.max(0, Math.min(max, cur + d));
  };
  const bump = (id: string, side: "buy" | "sell", d: number) => {
    const row = c.rows.find((x) => x.id === id)!;
    const f = step(row, side, d);
    if (side === "buy") setBuy({ ...buy, [id]: f(buy[id] ?? 0) });
    else setSell({ ...sell, [id]: f(sell[id] ?? 0) });
  };
  const clean = (r: Record<string, number>) => Object.fromEntries(Object.entries(r).filter(([, n]) => n > 0));
  const give = value(sell), get = value(buy), need = Math.ceil(get * c.markup);
  return (
    <div class="menu trademenu" data-testid="trade-panel">
      <h3>{t("trade.title", { faction: t(`fac.${c.faction}`) })}</h3>
      <p class="hint">{t("trade.leaves", { h: c.hoursLeft })}</p>
      <table>
        <thead>
          <tr>
            <th>{t("trade.item")}</th>
            <th>{t("trade.yours")}</th>
            <th>{t("trade.sell")}</th>
            <th>{t("trade.buy")}</th>
            <th>{t("trade.theirs")}</th>
          </tr>
        </thead>
        <tbody>
          {c.rows.map((r) => (
            <tr key={r.id}>
              <td>
                {t(`item.${r.id}`)} <small>({r.value})</small>
              </td>
              <td>{r.yours}</td>
              <td>
                <button onClick={() => bump(r.id, "sell", -5)}>−</button>
                <b>{sell[r.id] ?? 0}</b>
                <button data-testid={`sell-${r.id}`} onClick={() => bump(r.id, "sell", 5)}>+</button>
              </td>
              <td>
                <button onClick={() => bump(r.id, "buy", -1)}>−</button>
                <b>{buy[r.id] ?? 0}</b>
                <button data-testid={`buy-${r.id}`} onClick={() => bump(r.id, "buy", 1)}>+</button>
              </td>
              <td>{r.theirs}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>{t("trade.total", { give: Math.round(give), get: Math.round(get), need })}</p>
      <button
        data-testid="do-trade"
        disabled={!give || (get > 0 && give < need)}
        onClick={() => {
          actions.trade(clean(buy), clean(sell));
          setBuy({});
          setSell({});
        }}
      >
        {get > 0 ? t("trade.do") : t("trade.gift")}
      </button>
      {c.problem && <p class="neg">{t(c.problem)}</p>}
    </div>
  );
}
