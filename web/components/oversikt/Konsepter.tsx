import Link from "next/link";
import { Trendlinje } from "@/components/grafer/Trendlinje";
import { Forelopig, InfoIkon } from "@/components/InfoIkon";
import { formatDayMonth, formatNumber, formatPercent } from "@/lib/format";
import { KILDER } from "@/lib/kilder";
import { BEFORE_CONCEPTS, barScale, type ConceptBlock, type ConceptLine } from "@/lib/oversikt/konsepter";

function Status({ line }: { line: ConceptLine }) {
  if (line.status === "forelopig") return <Forelopig />;
  if (line.status === "inaktiv")
    return (
      <>
        <span className="tag" title={KILDER.inaktiv}>
          inaktiv
        </span>
        {line.lastPublished && <span className="muted small"> · siste {formatDayMonth(line.lastPublished)}</span>}
      </>
    );
  return null;
}

function Stolpe({ width, muted }: { width: number; muted: boolean }) {
  return <span className={muted ? "cbar muted-bar" : "cbar"} style={{ width: `${width * 0.6}px` }} aria-hidden="true" />;
}

function Blokk({ block }: { block: ConceptBlock }) {
  const id = `${block.platform}-${block.format}`;
  const views = barScale(block.lines, "medianViews");
  const engagement = barScale(block.lines, "engagement");
  return (
    <div className={`card concept-card ${block.platform}`}>
      <div className="plat concept-plat">{block.name}</div>
      {block.lines.length === 0 ? (
        <p className="muted small">Ingen konsepter med innlegg som er minst 7 dager gamle.</p>
      ) : (
        <table className="ctable">
          <caption className="sr-only">Konsepter, {block.name}</caption>
          <thead>
            <tr>
              <th scope="col">Konsept</th>
              <th scope="col" className="n hide-m">
                Innlegg
              </th>
              <th scope="col" className="n">
                Median visninger <InfoIkon id={`kv-${id}`} text={KILDER.konsepter} />
              </th>
              <th scope="col" className="n">
                Engasjement per visning <InfoIkon id={`ke-${id}`} text={KILDER.engasjement} />
              </th>
              <th scope="col" className="n hide-m">
                Siste 10 innlegg
              </th>
            </tr>
          </thead>
          <tbody>
            {block.lines.map((line) => {
              const muted = line.status === "forelopig";
              return (
                <tr key={line.concept} className={line.status}>
                  <th scope="row">
                    {line.concept}
                    <Status line={line} />
                    <span className="show-m muted small"> · {formatNumber(line.posts)} innlegg</span>
                  </th>
                  <td className="n hide-m">{formatNumber(line.posts)}</td>
                  <td className="n">
                    <Stolpe width={views(line.medianViews)} muted={muted} />
                    {formatNumber(line.medianViews)}
                  </td>
                  <td className="n">
                    <Stolpe width={engagement(line.engagement)} muted={muted} />
                    {formatPercent(line.engagement)}
                  </td>
                  <td className={`n hide-m spark-cell${muted ? " muted-spark" : ""}`}>
                    {line.spark.length > 1 ? (
                      <Trendlinje points={line.spark} height={26} ariaLabel={`Visninger for de siste ${line.spark.length} innleggene i ${line.concept}`} />
                    ) : (
                      <span className="muted small">–</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {block.events.length > 0 && (
        <details className="events">
          <summary>
            Spesielle hendelser ({block.events.length}) <InfoIkon id={`ev-${id}`} text={KILDER.hendelser} />
          </summary>
          <ul>
            {block.events.map((e) => (
              <li key={`${e.event}-${e.concept}`}>
                <strong>{e.event}</strong> · {e.concept} · {formatNumber(e.posts)} innlegg · median {formatNumber(e.medianViews)} visninger ·{" "}
                {formatPercent(e.engagement)} engasjement per visning
                {e.preliminary && (
                  <>
                    {" "}
                    <Forelopig />
                  </>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** «Hvilket konsept bør vi lage mer av?» Én blokk per plattform og format; sammenlign bare innenfor blokken. */
export function Konsepter({
  blocks,
  showBeforeConcepts,
  toggleHref,
}: {
  blocks: ConceptBlock[];
  showBeforeConcepts: boolean;
  toggleHref: string;
}) {
  const hidden = blocks.reduce((sum, b) => sum + b.hidden, 0);
  return (
    <section className="block" aria-labelledby="konsepter">
      <div className="block-head">
        <div>
          <h2 id="konsepter">Hvilket konsept bør vi lage mer av?</h2>
          <p className="block-sub">Median per innlegg, bare innlegg som er minst 7 dager gamle. Sammenlign bare innenfor samme blokk.</p>
        </div>
        {(hidden > 0 || showBeforeConcepts) && (
          <Link className="toggle" href={toggleHref} scroll={false} role="switch" aria-checked={showBeforeConcepts}>
            <span className={showBeforeConcepts ? "switch on" : "switch"} aria-hidden="true" />
            Vis «{BEFORE_CONCEPTS}»
          </Link>
        )}
      </div>
      <div className="concepts">
        {blocks.map((block) => (
          <Blokk key={`${block.platform}-${block.format}`} block={block} />
        ))}
      </div>
    </section>
  );
}
