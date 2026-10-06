import { Trendlinje } from "@/components/grafer/Trendlinje";
import { InfoIkon } from "@/components/InfoIkon";
import { formatNumber } from "@/lib/format";
import { KILDER } from "@/lib/kilder";
import type { HeroCard } from "@/lib/oversikt/kort";
import { Endring } from "./Endring";

/** Plattformkort i det mørke toppfeltet: visninger, endring og trendlinje side om side. */
export function Plattformkort({ card, trendLabel }: { card: HeroCard; trendLabel: string }) {
  return (
    <article className={`hero ${card.platform}`}>
      <header className="hero-head">
        <h2>
          {card.name}
          {card.platform === "instagram" && <InfoIkon id={`kort-${card.id}`} text={KILDER.instagramKort} />}
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

      <footer className="hero-foot">
        {card.followers && (
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
