import { t } from "@wc/data";
import { useState } from "preact/hooks";
import { installedMods, installMod, modErrors, raiseMod, removeMod, setModEnabled } from "../mods.ts";

/** Mod list (Beta B7): add a pack file, switch packs on or off, change load order, see errors. */
export function Mods() {
  const [list, setList] = useState(installedMods());
  const [err, setErr] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);
  const refresh = () => {
    setList(installedMods());
    setChanged(true);
  };
  const onFile = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    for (const f of [...(input.files ?? [])]) {
      const res = installMod(await f.text());
      setErr(res ? t(res, { file: f.name }) : null);
    }
    input.value = "";
    refresh();
  };
  return (
    <div class="mods" data-testid="mods">
      <p class="hint">{t("mods.hint")}</p>
      {!list.length && <p class="hint">{t("mods.none")}</p>}
      <ul class="modlist">
        {list.map((m, i) => (
          <li key={m.id} class={m.enabled ? "" : "off"}>
            <label>
              <input type="checkbox" checked={m.enabled} onChange={() => (setModEnabled(m.id, !m.enabled), refresh())} />
              <b>{m.name}</b> {m.version && <small>v{m.version}</small>}
            </label>
            {m.description && <small class="desc">{m.description}</small>}
            {modErrors[m.id] && (
              <ul class="moderr">
                {modErrors[m.id].map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
            <span class="modbtns">
              {i > 0 && (
                <button title={t("mods.up")} onClick={() => (raiseMod(m.id), refresh())}>
                  ↑
                </button>
              )}
              <button onClick={() => (removeMod(m.id), refresh())}>{t("mods.remove")}</button>
            </span>
          </li>
        ))}
      </ul>
      {err && <p class="moderr">{err}</p>}
      <label class="modadd">
        <span>{t("mods.add")}</span>
        <input type="file" accept=".json,application/json" multiple onChange={onFile} />
      </label>
      {changed && <p class="hint">{t("mods.restart")}</p>}
    </div>
  );
}
