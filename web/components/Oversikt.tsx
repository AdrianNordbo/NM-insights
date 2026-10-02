import { Utvikling } from "@/components/grafer/Utvikling";
import { Anbefalinger } from "@/components/oversikt/Anbefalinger";
import { Engasjement } from "@/components/oversikt/Engasjement";
import { Ferske } from "@/components/oversikt/Ferske";
import { HvaFunketSist } from "@/components/oversikt/HvaFunketSist";
import { Konsepter } from "@/components/oversikt/Konsepter";
import { Plattformkort } from "@/components/oversikt/Plattformkort";
import { Periodevelger, Toppfelt } from "@/components/oversikt/Toppfelt";
import type { ConceptSummaryRow, ContentLatestRow, Result } from "@/lib/data/types";
import { formatFetched } from "@/lib/format";
import { hrefFor } from "@/lib/oversikt/adresse";
import { buildRecommendations } from "@/lib/oversikt/anbefalinger";
import { buildConceptBlocks } from "@/lib/oversikt/konsepter";
import type { OversiktTopp } from "@/lib/oversikt/side";
import { buildRecent } from "@/lib/oversikt/sist";

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
          {content.ok && concepts.ok && (
            <Anbefalinger line={buildRecommendations(concepts.data, content.data, today, feed)} />
          )}
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
        {topp.ok && <Ferske groups={topp.data.fresh} />}
        {topp.ok && <Utvikling series={topp.data.utvikling.series} posts={topp.data.utvikling.posts} />}

        {content.ok && concepts.ok ? (
          <>
            <HvaFunketSist items={buildRecent(content.data, concepts.data, feed)} />
            <Konsepter
              blocks={buildConceptBlocks(concepts.data, content.data, today, showBeforeConcepts, feed)}
              showBeforeConcepts={showBeforeConcepts}
              toggleHref={beforeConceptsHref}
            />
          </>
        ) : (
          <Notice>{!content.ok ? content.error : !concepts.ok ? concepts.error : ""}</Notice>
        )}
      </main>
    </>
  );
}
