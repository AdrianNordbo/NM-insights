import { Forelopig, InfoIkon } from "@/components/InfoIkon";
import { formatNumber, formatRatio } from "@/lib/format";
import { KILDER } from "@/lib/kilder";
import type { RecentPost } from "@/lib/oversikt/sist";

function Kort({ item }: { item: RecentPost }) {
  const { post } = item;
  return (
    <article className={`card recent ${item.platform}`}>
      <div className="recent-kicker">
        <span className="plat">{item.name}</span>
        {item.state === "single" && <span className="muted"> · eneste innlegg i perioden</span>}
      </div>
      {!post ? (
        <p className="muted small">Ingen innlegg i perioden.</p>
      ) : (
        <>
          {post.permalink ? (
            <a className="recent-title" href={post.permalink} target="_blank" rel="noopener noreferrer">
              {post.title} <span aria-hidden="true">↗</span>
              <span className="sr-only"> (åpnes i ny fane)</span>
            </a>
          ) : (
            <span className="recent-title">{post.title}</span>
          )}
          <div className="recent-meta">
            {post.concept} · {post.published}
          </div>
          <div className="recent-views">
            {formatNumber(post.views)} <span>visninger</span>
          </div>
          {item.ratio != null && (
            <div className="recent-ratio">
              <span className={`pill ${item.highlight ? "up" : "same"}`}>{formatRatio(item.ratio)}</span>
              <span className="muted small">av vanlig for {post.concept}</span>
              <InfoIkon id={`ganger-${item.platform}-${item.format}`} text={KILDER.ganger} />
              {item.preliminary && <Forelopig />}
            </div>
          )}
        </>
      )}
    </article>
  );
}

/** «Hva funket sist?»: beste innlegg 7–14 dager gamle per plattform og format. */
export function HvaFunketSist({ items }: { items: RecentPost[] }) {
  return (
    <section className="block" aria-labelledby="sist">
      <div className="block-head">
        <h2 id="sist">
          Hva funket sist? <InfoIkon id="sist" text={KILDER.sist} />
        </h2>
        <p className="block-sub">Innlegg publisert for 7–14 dager siden</p>
      </div>
      <div className="card-grid">
        {items.map((item) => (
          <Kort key={`${item.platform}-${item.format}`} item={item} />
        ))}
      </div>
    </section>
  );
}
