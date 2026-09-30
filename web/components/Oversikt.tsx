import Link from "next/link";
import { HvaFunketSistKort } from "@/components/HvaFunketSist";
import { InfoIkon } from "@/components/InfoIkon";
import { KonseptBlokk } from "@/components/Konsepter";
import { PlattformKort, TikTokKort } from "@/components/PlattformKort";
import type { ConceptSummaryRow, ContentLatestRow, PlatformSummaryRow, Result } from "@/lib/data/types";
import { formatFetched } from "@/lib/format";
import { BEFORE_CONCEPTS, buildConceptBlocks } from "@/lib/forside/konsepter";
import { buildPlatformCards } from "@/lib/forside/plattform";
import { buildRecent } from "@/lib/forside/sist";
import { KILDER } from "@/lib/kilder";

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="notice" role="status">
      {children}
    </p>
  );
}

export type OversiktData = {
  platformRows: Result<PlatformSummaryRow[]>;
  content: Result<ContentLatestRow[]>;
  concepts: Result<ConceptSummaryRow[]>;
  /** Dagens dato i Oslo, «YYYY-MM-DD». */
  today: string;
  showBeforeConcepts: boolean;
};

/** Forsiden (presentasjon). Data hentes i app/(app)/page.tsx. */
export function Oversikt({ platformRows, content, concepts, today, showBeforeConcepts }: OversiktData) {

  const lastFetched = content.ok
    ? content.data.map((p) => p.fetched_at).filter((t): t is string => Boolean(t)).sort().at(-1)
    : undefined;
  const conceptBlocks =
    concepts.ok && content.ok ? buildConceptBlocks(concepts.data, content.data, today, showBeforeConcepts) : [];
  const hiddenCount = conceptBlocks.reduce((sum, b) => sum + b.hidden, 0);

  return (
    <main className="page">
      <div className="page-head">
        <h1>Oversikt</h1>
        {lastFetched && (
          <p className="muted small">
            Sist oppdatert {formatFetched(lastFetched)} <InfoIkon id="oppdatert" text={KILDER.oppdatert} />
          </p>
        )}
      </div>

      <section className="recommendations" aria-label="Anbefalinger">
        <h2>Anbefalinger</h2>
        <p className="muted small">Kommer i neste steg.</p>
      </section>

      <section aria-labelledby="plattformer">
        <h2 id="plattformer">Hvordan går det med hver plattform?</h2>
        {platformRows.ok ? (
          <div className="card-grid">
            {buildPlatformCards(platformRows.data, today).map((card) => (
              <PlattformKort key={card.platform} card={card} />
            ))}
            <TikTokKort />
          </div>
        ) : (
          <Notice>{platformRows.error}</Notice>
        )}
      </section>

      <section aria-labelledby="sist">
        <h2 id="sist">
          Hva funket sist? <span className="muted small">innlegg 7–14 dager gamle</span>{" "}
          <InfoIkon id="sist" text={KILDER.sist} />
        </h2>
        {content.ok && concepts.ok ? (
          <div className="card-grid">
            {buildRecent(content.data, concepts.data).map((item) => (
              <HvaFunketSistKort key={`${item.platform}-${item.format}`} item={item} />
            ))}
          </div>
        ) : (
          <Notice>{!content.ok ? content.error : !concepts.ok ? concepts.error : ""}</Notice>
        )}
      </section>

      <section aria-labelledby="konsepter">
        <div className="section-head">
          <h2 id="konsepter">Hvilket konsept bør vi lage mer av?</h2>
          {(hiddenCount > 0 || showBeforeConcepts) && (
            <Link className="toggle" href={showBeforeConcepts ? "/" : "/?vis=alle"} scroll={false}>
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
  );
}
