import { InfoIkon } from "./InfoIkon";
import { formatNumber, formatRange } from "@/lib/format";
import type { PlatformCardData } from "@/lib/forside/plattform";
import { FOLLOWER_NAME, FORMAT_NAME, NEW_FOLLOWER_NAME, PLATFORM_NAME } from "@/lib/navn";
import { KILDER } from "@/lib/kilder";

/** Pil mot forrige uke pluss forrige ukes verdi, f.eks. «122 ▲ (uke 37: 45)». Ingen prosent. */
function VsPrev({ value, prev, prevWeek }: { value: number | null; prev: number | null; prevWeek: number }) {
  const arrow = value == null || prev == null ? null : value > prev ? "▲" : value < prev ? "▼" : "=";
  const direction = arrow === "▲" ? "up" : arrow === "▼" ? "down" : "same";
  return (
    <>
      {arrow && (
        <span className={`arrow ${direction}`} aria-hidden="true">
          {arrow}
        </span>
      )}
      <span className="prev"> (uke {prevWeek}: {formatNumber(prev)})</span>
    </>
  );
}

export function PlattformKort({ card }: { card: PlatformCardData }) {
  const { platform, week } = card;
  return (
    <article className="card">
      <header className="card-head">
        <h3>{PLATFORM_NAME[platform]}</h3>
      </header>

      <dl className="kv">
        <div>
          <dt>
            {FOLLOWER_NAME[platform]} <InfoIkon id={`folgere-${platform}`} text={KILDER.folgere} />
          </dt>
          <dd className="big">{formatNumber(card.followersTotal)}</dd>
        </div>
        {week && (
          <div>
            <dt>
              {NEW_FOLLOWER_NAME[platform]} uke {week.number}
            </dt>
            <dd className="big">{week.enoughFollowerData ? formatNumber(week.newFollowers) : <span className="muted small">Ikke nok data</span>}</dd>
          </div>
        )}
      </dl>

      {week ? (
        <>
          <p className="week">
            Uke {week.number} · {formatRange(week.start, week.end)}{" "}
            <InfoIkon id={`uke-${platform}`} text={KILDER.uke} />
          </p>
          {week.formats.map((f) => (
            <section key={f.format} className="format-row">
              <h4>{FORMAT_NAME[f.format]}</h4>
              <dl className="kv compact">
                <div>
                  <dt>Publisert</dt>
                  <dd>
                    {formatNumber(f.published)} <VsPrev value={f.published} prev={f.prevPublished} prevWeek={week.prevNumber} />
                  </dd>
                </div>
                <div>
                  <dt>
                    Median visninger <InfoIkon id={`visn-${platform}-${f.format}`} text={KILDER.visninger} />
                  </dt>
                  <dd>
                    {formatNumber(f.medianViews)}{" "}
                    <VsPrev value={f.medianViews} prev={f.prevMedianViews} prevWeek={week.prevNumber} />
                  </dd>
                </div>
              </dl>
            </section>
          ))}
        </>
      ) : (
        <p className="muted small">Ingen uke med bare modne innlegg ennå.</p>
      )}
    </article>
  );
}

export function TikTokKort() {
  return (
    <article className="card coming">
      <header className="card-head">
        <h3>TikTok</h3>
        <span className="tag">kommer</span>
      </header>
      <p className="muted small">Kobles til når API-tilgangen er godkjent.</p>
    </article>
  );
}
