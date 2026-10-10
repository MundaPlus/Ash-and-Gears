import { t } from "@wc/data";
import { useState } from "preact/hooks";
import { actions, useStore } from "./store.ts";
import { clearMark } from "../session.ts";

/** Ending screen (Beta B1): a won story shows slides per survivor; a lost colony shows an obituary. */
export function Ending() {
  const s = useStore();
  const [page, setPage] = useState(0);
  const e = s.ending;
  if (!e) return null;
  const won = e.kind === "won";
  const slide = e.slides[page];
  return (
    <div class="ending" role="dialog" aria-modal="true" data-testid="ending">
      <div class="ending-card">
        <p class="kicker">{won ? t("ending.won.kicker") : t("ending.lost.kicker")}</p>
        <h2>{won ? t(`ending.won.${e.line}`) : t("ending.lost.title")}</h2>
        <p class="lede">{won ? t(`ending.won.${e.line}.text`) : t("ending.lost.text")}</p>
        {slide && (
          <div class="slide" key={page}>
            <h3>{slide.name}</h3>
            <p>{t(slide.key, { ...slide.params, cause: typeof slide.params.cause === "string" ? t(slide.params.cause) : "" })}</p>
            <small>
              {page + 1} / {e.slides.length}
            </small>
          </div>
        )}
        <div class="ending-buttons">
          {page + 1 < e.slides.length && <button onClick={() => setPage(page + 1)}>{t("ending.next")}</button>}
          {won && (
            <button
              class="on"
              onClick={() => {
                setPage(0);
                actions.closeEnding();
              }}
            >
              {t("ending.continue")}
            </button>
          )}
          <button
            onClick={() => {
              clearMark();
              location.search = "";
            }}
          >
            {t("ending.menu")}
          </button>
        </div>
      </div>
    </div>
  );
}
