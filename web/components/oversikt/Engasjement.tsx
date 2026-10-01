import { Trendlinje } from "@/components/grafer/Trendlinje";
import { InfoIkon } from "@/components/InfoIkon";
import { formatNumber } from "@/lib/format";
import { KILDER } from "@/lib/kilder";
import type { EngagementRow } from "@/lib/oversikt/kort";
import { Endring } from "./Endring";

/** «Engasjement i perioden»: likes, kommentarer, delinger (og lagringer på Instagram) per plattform og format. */
export function Engasjement({ rows, trendLabel }: { rows: EngagementRow[]; trendLabel: string }) {
  return (
    <section className="block" aria-labelledby="engasjement">
      <div className="block-head">
        <h2 id="engasjement">
          Engasjement i perioden <InfoIkon id="engasjement" text={KILDER.aktivitet} />
        </h2>
        <p className="block-sub">Aktivitet på hele kontoen, også på eldre innlegg. {trendLabel} i linjene.</p>
      </div>
      <div className="eng-rows">
        {rows.map((row) => (
          <div key={row.id} className={`eng-row ${row.platform}`}>
            <div className="eng-name">
              <span className="plat">{row.name}</span>
              {row.partialNote && <span className="tag">{row.partialNote}</span>}
            </div>
            <div className="eng-tiles">
              {row.tiles.map((tile) => (
                <div key={tile.key} className="metric-tile">
                  <div className="metric-label">{tile.label}</div>
                  <div className="metric-value">{formatNumber(tile.value)}</div>
                  <Endring delta={tile.delta} />
                  <Trendlinje points={tile.trend} height={30} ariaLabel={`${tile.label}, ${trendLabel.toLowerCase()}`} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
