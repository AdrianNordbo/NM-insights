import { Trendlinje } from "@/components/grafer/Trendlinje";
import { InfoIkon } from "@/components/InfoIkon";
import { formatNumber } from "@/lib/format";
import { KILDER } from "@/lib/kilder";
import type { HeroCard } from "@/lib/oversikt/kort";
import { Endring } from "./Endring";
import { KildeLinje } from "./KildeLinje";

const FOLLOWER_INFO: Record<HeroCard["platform"], string> = {
  instagram: KILDER.folgereInstagram,
  youtube: KILDER.folgereYoutube,
  tiktok: KILDER.folgereTiktok,
};

const NET_LABEL: Record<HeroCard["platform"], string> = {
  instagram: "Netto nye følgere",
  youtube: "Netto nye abonnenter",
  tiktok: "Netto nye følgere",
};

/** «+8», «−2», «0» og «–» vises som tall; «ikke nok data» som tekst. */
const isNumber = (value: string) => /^[+−\-–]?\d|^–$/.test(value);

/** Plattformkort i det mørke toppfeltet: visninger, endring og trendlinje side om side. */
export function Plattformkort({ card, trendLabel }: { card: HeroCard; trendLabel: string }) {
  return (
    <article className={`hero ${card.platform}`}>
      <header className="hero-head">
        <h2>
          {card.name}
          {card.platform === "instagram" && <InfoIkon id={`kort-${card.id}`} text={KILDER.instagramKort} />}
          {card.platform === "tiktok" && <InfoIkon id={`kort-${card.id}`} text={KILDER.tiktokKort} />}
        </h2>
        {card.partialNote && <span className="chip">{card.partialNote}</span>}
      </header>

      {card.noDataNote ? (
        <p className="hero-empty">{card.noDataNote}</p>
      ) : (
        <div className="hero-body">
          <div>
            <div className="hero-label">Visninger</div>
            <div className="hero-num">{formatNumber(card.views)}</div>
            <Endring delta={card.delta} />
          </div>
          <div className="hero-spark">
            <Trendlinje points={card.trend} height={72} fill ariaLabel={`Visninger, ${trendLabel.toLowerCase()}`} />
            <div className="hero-spark-cap">{trendLabel}</div>
          </div>
        </div>
      )}

      {/* Netto nye følgere i perioden: eget felt med samme vekt som visningene (når dashboard.followers
          finnes). Totalen («følgere nå») vises bare i Total. */}
      {card.followers?.netto && (
        <section className="hero-follow" aria-label={NET_LABEL[card.platform]}>
          <div className="hero-follow-cell">
            <div className="hero-label">
              {NET_LABEL[card.platform]} <InfoIkon id={`folgere-${card.id}`} text={FOLLOWER_INFO[card.platform]} />
            </div>
            <div className="hero-num-row">
              <span className={isNumber(card.followers.netto.value) ? "hero-num" : "hero-num-text"}>
                {card.followers.netto.value}
              </span>
              {card.followers.netto.note && <span className="hero-num-note">{card.followers.netto.note}</span>}
            </div>
          </div>
          {/* Brutto (dempet) og kildeetikett: egen linje under netto */}
          <KildeLinje
            parts={[
              card.followers.gross &&
                `${card.followers.gross.label}: ${card.followers.gross.value == null ? "ikke nok data" : formatNumber(card.followers.gross.value)}`,
              card.followers.netto.sourceLabel,
            ]}
          />
        </section>
      )}

      <footer className="hero-foot">
        {/* Uten dashboard.followers: følgerlinjene som før */}
        {card.followers && !card.followers.netto && (
          <>
            <span>
              {card.followers.label} <b>{formatNumber(card.followers.total)}</b>
            </span>
            <span>
              {card.followers.newLabel}{" "}
              <b>{card.followers.newInPeriod == null ? "ikke nok data" : formatNumber(card.followers.newInPeriod)}</b>
            </span>
          </>
        )}
        <span>
          Innlegg publisert <b>{formatNumber(card.posts)}</b>
        </span>
      </footer>
    </article>
  );
}
