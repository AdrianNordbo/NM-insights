import Link from "next/link";
import { formatDayMonth, formatNumber, formatPercent } from "@/lib/format";
import type { RecommendationBlock, RuleKind } from "@/lib/oversikt/anbefalinger";
import { barScale, type ConceptBlock, type ConceptStatus, INACTIVE_AFTER_DAYS } from "@/lib/oversikt/konsepter";
import { bruddNavn, KONSEPTBRUDD } from "@/lib/regler/konsepter";
import type { PlattformValgDef } from "@/lib/regler/plattformer";
import { Filtre } from "./Filtre";
import { Minigraf } from "./Minigraf";

type Option = { key: string; label: string };
const STATUS: Record<ConceptStatus, [string, string]> = { aktiv: ["aktiv", ""], inaktiv: ["inaktiv", "neutral"], forelopig: ["foreløpig", "warn"] };
const RKIND: Record<RuleKind, string> = { A: "Mønster", B: "Mønster", B2: "Mønster", C: "Følg med" };
const BANK = "Bankinfo (Veksthusets egne informasjons- og reklameinnlegg) er med i totalene og kontotallene, men ikke i konsepter, anbefalinger, mønstre, medianer eller innleggslistene.";

export function bruddTekst() {
  return KONSEPTBRUDD.map(
    (b) =>
      `${b.concept} har ${b.reason} fra ${formatDayMonth(b.from)}. Innlegg før og etter blandes ikke: frem til det finnes minst 6 innlegg som er minst 7 dager gamle etter ${formatDayMonth(b.from)}, bygger medianer og mønstre for ${b.concept} bare på innleggene før, og de nye vises som en egen, foreløpig gruppe («${bruddNavn(b)}»).`,
  ).join(" ");
}

export function InnholdsserierVisning({
  valg,
  plattformer,
  blocks,
  recs,
  showBefore,
}: {
  valg: PlattformValgDef;
  plattformer: Option[];
  blocks: ConceptBlock[];
  recs: RecommendationBlock[];
  showBefore: boolean;
}) {
  const toggle = `/innholdsserier?plattform=${valg.key}${showBefore ? "" : "&vis=alle"}`;
  return (
    <>
      <div className="top">
        <div>
          <div className="eyebrow">Veksthuset</div>
          <h1>Innholdsserier</h1>
          <div className="sub">Konsepter og anbefalinger per plattform og format. Sammenlign bare innenfor samme blokk.</div>
        </div>
        <Filtre plattformer={plattformer} plattform={valg.key} extra={showBefore ? { vis: "alle" } : {}} />
      </div>
      {!blocks.length && <p className="empty-state">Ingen konsepter med modne innlegg for {valg.label}.</p>}
      {blocks.map((b) => {
        const rec = recs.find((r) => r.platform === b.platform && r.format === b.format);
        const scale = barScale(b.lines, "medianViews");
        return (
          <section key={`${b.platform}-${b.format}`} className="block" aria-labelledby={`k-${b.platform}-${b.format}`}>
            <h2 id={`k-${b.platform}-${b.format}`} className={`plat p-${b.platform}`}>
              {b.name}
            </h2>
            <div className="sub">Median visninger per innlegg som er minst 7 dager gammelt · uten Bankinfo</div>
            {rec?.recommendation && (
              <div className="notice">
                <p>
                  <b>{RKIND[rec.recommendation.kind]}:</b> {rec.recommendation.text}
                </p>
                {rec.promising && <p>{rec.promising.text}</p>}
              </div>
            )}
            <div className="sub-h">Konsepter</div>
            <div className="series">
              {b.lines.map((l) => (
                <div key={l.concept} className={`card${l.status === "forelopig" ? " dim" : ""}`}>
                  <div className="name">
                    <span>{l.concept}</span>
                    <span className={`pill ${STATUS[l.status][1]}`} title={l.status === "inaktiv" ? `Ingen innlegg de siste ${INACTIVE_AFTER_DAYS} dagene` : undefined}>
                      {STATUS[l.status][0]}
                    </span>
                  </div>
                  <div className="value">{formatNumber(l.medianViews)}</div>
                  <div className="vlabel">median visninger</div>
                  <div className="track">
                    <div className="fill" style={{ width: `${Math.max(2, scale(l.medianViews)).toFixed(1)}%` }} />
                  </div>
                  <div className="sub small">
                    {l.posts} innlegg · {formatPercent(l.engagement)} engasjement per visning
                  </div>
                  {l.spark.length > 1 && (
                    <div className="spark">
                      <Minigraf values={l.spark.map((s) => s.value)} height={34} label={`Visninger, siste ${l.spark.length} innlegg, ${l.concept}`} />
                      <div className="spark-cap">Siste {l.spark.length} innlegg</div>
                    </div>
                  )}
                  {KONSEPTBRUDD.some((x) => x.concept === l.concept) && (
                    <div className="break">
                      {KONSEPTBRUDD.filter((x) => x.concept === l.concept).map((x) => `Ny teksting fra ${formatDayMonth(x.from)}: innlegg fra da telles som egen gruppe til det er nok av dem.`)}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {b.events.length > 0 && (
              <details className="events">
                <summary>Spesielle hendelser ({b.events.length})</summary>
                {b.events.map((e) => (
                  <p key={`${e.event}-${e.concept}`}>
                    {e.event} · {e.concept} · {e.posts} innlegg · median {formatNumber(e.medianViews)} visninger
                  </p>
                ))}
              </details>
            )}
            {(b.hidden > 0 || showBefore) && (
              <p className="small">
                <Link className="link" href={toggle}>
                  {showBefore ? "Skjul Før konsepter" : "Vis Før konsepter"}
                </Link>
              </p>
            )}
            {b.format !== "FEED" && (
              <p className="small">
                <Link className="link" href={`/publiseringstid?plattform=${valg.key}`}>
                  Mønstre for {b.name} under Publiseringstid →
                </Link>
              </p>
            )}
          </section>
        );
      })}
      <details className="card help">
        <summary>Slik leser du tallene</summary>
        <ul>
          <li>Median per innlegg som er minst 7 dager gammelt. Grupper under 6 innlegg er foreløpige.</li>
          <li>Konsepter er inaktive når det er {INACTIVE_AFTER_DAYS} dager eller mer siden siste innlegg.</li>
          <li>{BANK}</li>
          <li>{bruddTekst()}</li>
          <li>Plattformene og formatene sammenlignes aldri med hverandre. «Alle plattformer» viser ikke Instagram Feed; velg Instagram Feed for å se den.</li>
        </ul>
      </details>
    </>
  );
}
