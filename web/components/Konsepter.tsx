import { Forelopig, InfoIkon } from "./InfoIkon";
import { formatDayMonth, formatNumber, formatPercent } from "@/lib/format";
import type { ConceptBlock, ConceptLine } from "@/lib/forside/konsepter";
import { FORMAT_NAME, PLATFORM_NAME } from "@/lib/navn";
import { KILDER } from "@/lib/kilder";

/** Stolpe skalert innenfor egen blokk og egen kolonne (aldri på tvers av formater). */
function Bar({ value, max, muted }: { value: number | null; max: number; muted: boolean }) {
  const width = value == null || max <= 0 ? 0 : Math.min(100, Math.max(2, (value / max) * 100));
  return (
    <span className="bar-track" aria-hidden="true">
      <span className={muted ? "bar muted-bar" : "bar"} style={{ width: `${width}%` }} />
    </span>
  );
}

function StatusNote({ line }: { line: ConceptLine }) {
  if (line.status === "forelopig") return <Forelopig />;
  if (line.status === "avsluttet" && line.lastPublished)
    return (
      <span className="muted small" title={KILDER.avsluttet}>
        siste innlegg {formatDayMonth(line.lastPublished)}
      </span>
    );
  return null;
}

export function KonseptBlokk({ block }: { block: ConceptBlock }) {
  const id = `${block.platform}-${block.format}`;
  // Skalaen settes av de ikke-foreløpige radene, så usikre tall ikke dominerer blokken.
  const scaleLines = block.lines.some((l) => l.status !== "forelopig")
    ? block.lines.filter((l) => l.status !== "forelopig")
    : block.lines;
  const maxViews = Math.max(0, ...scaleLines.map((l) => l.medianViews ?? 0));
  const maxEngagement = Math.max(0, ...scaleLines.map((l) => l.engagement ?? 0));

  return (
    <section className="concept-block">
      <h3>
        {PLATFORM_NAME[block.platform]} · {FORMAT_NAME[block.format]}
      </h3>
      {block.lines.length === 0 ? (
        <p className="muted small">Ingen konsepter med innlegg som er minst 7 dager gamle.</p>
      ) : (
        <div className="concept-table" role="table" aria-label={`Konsepter, ${PLATFORM_NAME[block.platform]} ${FORMAT_NAME[block.format]}`}>
          <div className="concept-row head" role="row">
            <span role="columnheader">Konsept</span>
            <span role="columnheader" className="num">
              Innlegg
            </span>
            <span role="columnheader">
              Median visninger <InfoIkon id={`kv-${id}`} text={KILDER.konsepter} />
            </span>
            <span role="columnheader">
              Engasjement per visning <InfoIkon id={`ke-${id}`} text={KILDER.engasjement} />
            </span>
          </div>
          {block.lines.map((line) => {
            const muted = line.status === "forelopig";
            return (
              <div key={line.concept} className={`concept-row ${line.status}`} role="row">
                <span role="cell" className="concept-name">
                  {line.concept} <StatusNote line={line} />
                </span>
                <span role="cell" className="num posts">
                  <span className="mobile-label">Innlegg </span>
                  {formatNumber(line.posts)}
                </span>
                <span role="cell" className="metric-cell">
                  <span className="mobile-label">Median visninger</span>
                  <Bar value={line.medianViews} max={maxViews} muted={muted} />
                  <span className="value">{formatNumber(line.medianViews)}</span>
                </span>
                <span role="cell" className="metric-cell">
                  <span className="mobile-label">Engasjement</span>
                  <Bar value={line.engagement} max={maxEngagement} muted={muted} />
                  <span className="value">{formatPercent(line.engagement)}</span>
                </span>
              </div>
            );
          })}
        </div>
      )}

      {block.events.length > 0 && (
        <details className="events">
          <summary>
            Spesielle hendelser ({block.events.length}) <InfoIkon id={`ev-${id}`} text={KILDER.hendelser} />
          </summary>
          <ul>
            {block.events.map((e) => (
              <li key={`${e.event}-${e.concept}`}>
                <strong>{e.event}</strong> · {e.concept} · {formatNumber(e.posts)} innlegg · median{" "}
                {formatNumber(e.medianViews)} visninger · {formatPercent(e.engagement)} engasjement
                {e.preliminary && <> <Forelopig /></>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
