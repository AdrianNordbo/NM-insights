import { Trendlinje } from "@/components/grafer/Trendlinje";
import { InfoIkon } from "@/components/InfoIkon";
import { formatNumber } from "@/lib/format";
import { KILDER } from "@/lib/kilder";
import { sinceLabel, type TotalModel, type TotalPlatform } from "@/lib/oversikt/total";

function Plattform({ p }: { p: TotalPlatform }) {
  const missingShares = p.posts - p.postsWithShares;
  return (
    <article className={`hero ${p.platform}`}>
      <header className="hero-head">
        <h2>
          {p.name} <InfoIkon id={`total-${p.platform}`} text={p.platform === "instagram" ? KILDER.totalInstagram : KILDER.totalYoutube} />
        </h2>
        <span className="chip">siden {sinceLabel(p.since)}</span>
      </header>
      <div className="hero-body">
        <div>
          <div className="hero-label">Visninger</div>
          <div className="hero-num">{formatNumber(p.views)}</div>
        </div>
        <div className="hero-spark">
          <Trendlinje points={p.cumulative} height={72} fill ariaLabel={`Visninger for ${p.name} samlet per uke siden ${sinceLabel(p.since)}`} />
          <div className="hero-spark-cap">Samlet per uke siden start</div>
        </div>
      </div>
      <footer className="hero-foot">
        <span>
          Likes <b>{formatNumber(p.likes)}</b>
        </span>
        <span>
          Kommentarer <b>{formatNumber(p.comments)}</b>
        </span>
        <span>
          Delinger <b>{formatNumber(p.shares)}</b>
          {missingShares > 0 && <span className="total-note"> ({p.postsWithShares} av {p.posts} innlegg)</span>}
        </span>
        <span>
          Innlegg <b>{formatNumber(p.posts)}</b>
        </span>
      </footer>
    </article>
  );
}

/** «Total» i toppfeltet: ett stort tall siden start, og ett kort per plattform. Ingen sammenligning mellom plattformene. */
export function Total({ total }: { total: TotalModel }) {
  return (
    <>
      <section className="total-hero" aria-labelledby="total-tittel">
        <h2 id="total-tittel" className="total-title">
          Totalt siden start ({sinceLabel(total.since)}) <InfoIkon id="total" text={KILDER.total} />
        </h2>
        <div className="total-num">{formatNumber(total.views)}</div>
        <p className="total-sub">visninger</p>
        <p className="total-sub">Instagram og YouTube. TikTok kommer når API-tilgangen er godkjent.</p>
      </section>
      <div className="heroes total-cards">
        {total.platforms.map((p) => (
          <Plattform key={p.platform} p={p} />
        ))}
        <article className="hero tiktok-coming">
          <header className="hero-head">
            <h2>TikTok</h2>
          </header>
          <p className="hero-empty">Kommer når API-tilgangen er godkjent.</p>
        </article>
      </div>
    </>
  );
}
