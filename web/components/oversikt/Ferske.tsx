import { InfoIkon } from "@/components/InfoIkon";
import { formatNumber } from "@/lib/format";
import { KILDER } from "@/lib/kilder";
import type { FreshGroup } from "@/lib/oversikt/ferske";

/** Innlegg under 7 dager gamle: tidlig signal, ikke endelige tall. Én rad per plattform og format. */
export function Ferske({ groups }: { groups: FreshGroup[] }) {
  return (
    <section className="block" aria-labelledby="ferske">
      <div className="block-head">
        <h2 id="ferske">
          Ferske innlegg <span className="notfinal">tidlig signal · ikke endelige tall</span>{" "}
          <InfoIkon id="ferske" text={KILDER.ferske} />
        </h2>
        <p className="block-sub">Publisert de siste 7 dagene, nyeste først</p>
      </div>
      {groups.length === 0 ? (
        <p className="muted small">Ingen innlegg de siste 7 dagene.</p>
      ) : (
        <div className="fresh">
          {groups.map((g) => (
            <div key={g.id} className={`fresh-group ${g.platform}`}>
              <div className="plat">
                {g.name} <span className="muted">· {g.posts.length} innlegg</span>
              </div>
              <ul className="fresh-row">
                {g.posts.map((p) => (
                  <li key={p.id} className="fresh-card">
                    <div className="fresh-meta">
                      {p.published} · {p.age}
                    </div>
                    {p.permalink ? (
                      <a className="fresh-title" href={p.permalink} target="_blank" rel="noopener noreferrer">
                        {p.title} <span aria-hidden="true">↗</span>
                        <span className="sr-only"> (åpnes i ny fane)</span>
                      </a>
                    ) : (
                      <span className="fresh-title">{p.title}</span>
                    )}
                    <div className="fresh-views">{formatNumber(p.views)}</div>
                    <div className="fresh-meta">
                      visninger hittil{p.concept ? ` · ${p.concept}` : ""}
                      {p.specialEvent && <span className="tag">{p.specialEvent}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
