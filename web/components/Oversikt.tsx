import Link from "next/link";
import { HvaFunketSistKort } from "@/components/HvaFunketSist";
import { InfoIkon } from "@/components/InfoIkon";
import { KonseptBlokk } from "@/components/Konsepter";
import { Engasjement } from "@/components/oversikt/Engasjement";
import { Plattformkort } from "@/components/oversikt/Plattformkort";
import { Periodevelger, Toppfelt } from "@/components/oversikt/Toppfelt";
import type { ConceptSummaryRow, ContentLatestRow, Result } from "@/lib/data/types";
import { formatFetched } from "@/lib/format";
import { BEFORE_CONCEPTS, buildConceptBlocks } from "@/lib/forside/konsepter";
import { buildRecent } from "@/lib/forside/sist";
import { KILDER } from "@/lib/kilder";
import { formatVisible, hrefFor } from "@/lib/oversikt/adresse";
import type { OversiktTopp } from "@/lib/oversikt/side";

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="notice" role="status">
      {children}
    </p>
  );
}

export type OversiktData = {
  topp: Result<OversiktTopp>;
  content: Result<ContentLatestRow[]>;
  concepts: Result<ConceptSummaryRow[]>;
  /** Dagens dato i Oslo, «YYYY-MM-DD». */
  today: string;
  showBeforeConcepts: boolean;
};

/** Forsiden (presentasjon). Data hentes i app/(app)/page.tsx, tallene regnes ut i lib/oversikt. */
export function Oversikt({ topp, content, concepts, today, showBeforeConcepts }: OversiktData) {
  const feed = topp.ok ? topp.data.state.feed : false;
  const lastFetched = content.ok
    ? content.data.map((p) => p.fetched_at).filter((t): t is string => Boolean(t)).sort().at(-1)
    : undefined;
  const conceptBlocks = (
    concepts.ok && content.ok ? buildConceptBlocks(concepts.data, content.data, today, showBeforeConcepts) : []
  ).filter((b) => formatVisible(b.format, feed));
  const hiddenCount = conceptBlocks.reduce((sum, b) => sum + b.hidden, 0);
  const beforeConceptsHref = topp.ok
    ? hrefFor(topp.data.state, showBeforeConcepts ? {} : { vis: "alle" })
    : showBeforeConcepts ? "/" : "/?vis=alle";

  return (
    <>
      {topp.ok ? (
        <Toppfelt
          title="Oversikt"
          controls={<Periodevelger nav={topp.data.nav} type={topp.data.state.period.type} label={topp.data.label} feed={feed} />}
        >
          {topp.data.summaries.length > 0 && (
            <div className="summary">
              {topp.data.summaries.map((line) => (
                <p key={line.id}>
                  <span className={`who ${line.platform}`}>{line.name}</span> {line.text}
                </p>
              ))}
            </div>
          )}
          <p className="band-meta">
            {lastFetched && <>Sist oppdatert {formatFetched(lastFetched)} · </>}
            TikTok <span className="chip">kommer</span>
          </p>
          <div className="heroes">
            {topp.data.heroes.map((card) => (
              <Plattformkort key={card.id} card={card} trendLabel={topp.data.trendLabel} />
            ))}
          </div>
        </Toppfelt>
      ) : (
        <Toppfelt title="Oversikt">
          <Notice>{topp.error}</Notice>
        </Toppfelt>
      )}

      <main className={topp.ok ? "page under-heroes" : "page"}>
        {topp.ok && <Engasjement rows={topp.data.engagement} trendLabel={topp.data.trendLabel} />}

        <section className="block" aria-labelledby="sist">
          <div className="block-head">
            <h2 id="sist">
              Hva funket sist? <InfoIkon id="sist" text={KILDER.sist} />
            </h2>
            <p className="block-sub">Innlegg publisert for 7–14 dager siden</p>
          </div>
          {content.ok && concepts.ok ? (
            <div className="card-grid">
              {buildRecent(content.data, concepts.data)
                .filter((item) => formatVisible(item.format, feed))
                .map((item) => (
                  <HvaFunketSistKort key={`${item.platform}-${item.format}`} item={item} />
                ))}
            </div>
          ) : (
            <Notice>{!content.ok ? content.error : !concepts.ok ? concepts.error : ""}</Notice>
          )}
        </section>

        <section className="block" aria-labelledby="konsepter">
          <div className="block-head">
            <h2 id="konsepter">Hvilket konsept bør vi lage mer av?</h2>
            {(hiddenCount > 0 || showBeforeConcepts) && (
              <Link className="toggle" href={beforeConceptsHref} scroll={false}>
                <span className={showBeforeConcepts ? "switch on" : "switch"} aria-hidden="true" />
                Vis «{BEFORE_CONCEPTS}»
              </Link>
            )}
          </div>
          {concepts.ok && content.ok ? (
            conceptBlocks.map((block) => <KonseptBlokk key={`${block.platform}-${block.format}`} block={block} />)
          ) : (
            <Notice>{!concepts.ok ? concepts.error : !content.ok ? content.error : ""}</Notice>
          )}
        </section>
      </main>
    </>
  );
}
