import { Trendlinje } from "@/components/grafer/Trendlinje";
import { InfoIkon } from "@/components/InfoIkon";
import { formatNumber } from "@/lib/format";
import { KILDER } from "@/lib/kilder";
import { sinceLabel, type TotalModel, type TotalPlatform } from "@/lib/oversikt/total";

/** Info-teksten for kortet, med antall innlegg som har delingstall når noen mangler. */
function infoText(p: TotalPlatform): string {
  const base = p.platform === "instagram" ? KILDER.totalInstagram : KILDER.totalYoutube;
  const missing = p.posts - p.postsWithShares;
  return missing > 0 ? `${base} Delinger finnes for ${p.postsWithShares} av ${p.posts} innlegg.` : base;
}

function Plattform({ p }: { p: TotalPlatform }) {
  const stats: [string, number][] = [
    ["Likes", p.likes],
    ["Kommentarer", p.comments],
    ["Delinger", p.shares],
    ["Innlegg", p.posts],
  ];
  return (
    <article className={`hero total-card ${p.platform}`}>
      <header className="hero-head">
        <h2>
          {p.name} <InfoIkon id={`total-${p.platform}`} text={infoText(p)} />
        </h2>
        <span className="chip">siden {sinceLabel(p.since)}</span>
      </header>
      <div className="total-card-body">
        <div className="hero-label">Visninger</div>
        <div className="hero-num">{formatNumber(p.views)}</div>
        <div className="total-card-spark">
          <Trendlinje points={p.cumulative} height={64} fill ariaLabel={`Visninger for ${p.name} samlet per uke siden ${sinceLabel(p.since)}`} />
          <div className="hero-spark-cap">Per uke siden start</div>
        </div>
      </div>
      <dl className="total-stats">
        {stats.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{formatNumber(value)}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

/** «Total» i toppfeltet: ett stort tall siden start, og ett kort per plattform. Ingen sammenligning mellom plattformene. */
export function Total({ total, updated }: { total: TotalModel; updated: string | null }) {
  return (
    <>
      <section className="total-hero" aria-labelledby="total-tittel">
        <h2 id="total-tittel" className="total-title">
          Total visninger siden start ({sinceLabel(total.since)}) <InfoIkon id="total" text={KILDER.total} />
        </h2>
        <div className="total-num">{formatNumber(total.views)}</div>
        <p className="total-sub">Instagram og YouTube. TikTok kommer når API-tilgangen er godkjent.</p>
        {updated && <p className="total-updated">{updated}</p>}
      </section>
      <div className="heroes total-cards">
        {total.platforms.map((p) => (
          <Plattform key={p.platform} p={p} />
        ))}
        <article className="hero total-card tiktok-coming">
          <header className="hero-head">
            <h2>TikTok</h2>
          </header>
          <p className="hero-empty">Kommer når API-tilgangen er godkjent.</p>
        </article>
      </div>
    </>
  );
}
