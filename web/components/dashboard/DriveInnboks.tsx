"use client";

import { useState } from "react";
import { leggTilFraDrive } from "@/app/(app)/publiseringstid/actions";
import type { HeatSection } from "@/lib/analyse/heatmap";
import { type InnboksRad, innboksForUke, innboksUker, muligDuplikat, plasserFraInnboks, skjulteIInnboks, velgUke } from "@/lib/plan/innboks";
import { lesUke, sammeUke, ukeKey } from "@/lib/plan/uke";
import type { PlanRad, UkeRegler } from "@/lib/plan/ukeplan";
import { PLAN_PLATTFORMER } from "@/lib/regler/plattformer";

type Run = (job: () => Promise<{ ok: boolean; error?: string }>, ok: string) => void;
type Props = {
  innboks: InnboksRad[];
  rows: PlanRad[];
  heat: Record<string, HeatSection>;
  regler: UkeRegler;
  today: string;
  pending: boolean;
  run: Run;
};

const label = (k: string) => PLAN_PLATTFORMER.find((p) => p.key === k)?.label ?? k;

/**
 * Nye videoer fra Drive (bare for redaktører), én uke om gangen. Valgt uke beholdes etter «Legg inn»; blir den tom,
 * vises neste uke med videoer. Tom innboks: ingenting vises. Ingenting legges inn før redaktøren trykker «Legg inn».
 */
export function DriveInnboks({ innboks, rows, heat, regler, today, pending, run }: Props) {
  const [valgt, setValgt] = useState<string | null>(null);
  const uker = innboksUker(innboks, today);
  const uke = velgUke(uker, lesUke(valgt));
  const skjult = skjulteIInnboks(innboks, today);
  const skjultTekst = [skjult.borte && `${skjult.borte} borte fra Drive`, skjult.passert && `${skjult.passert} fra passerte uker`].filter(Boolean).join(" · ");
  if (!uke) {
    // Bare skjulte rader igjen: én diskret linje; helt tom innboks: ingenting
    return skjultTekst ? (
      <div className="card innboks">
        <h2>Nye videoer fra Drive (0)</h2>
        <p className="micro">Skjult: {skjultTekst}.</p>
      </div>
    ) : null;
  }
  const { grupper, problemer } = innboksForUke(innboks, uke, today);
  const totalt = uker.reduce((s, u) => s + u.klare, 0);
  return (
    <div className="card innboks">
      <h2>Nye videoer fra Drive ({totalt})</h2>
      <div className="sub">
        Fra Drive-mappen, tolket av fetch_drive.py. «Legg inn» plasserer videoen i uken fra mappen etter reglene under, på samme måte som «Legg til video».
        Ingenting legges inn før du trykker.
      </div>
      <div className="ukevelger" role="group" aria-label="Uke i innboksen">
        {uker.map((u) => {
          const aktiv = sammeUke(u, uke);
          return (
            <button key={ukeKey(u)} type="button" aria-pressed={aktiv} className={aktiv ? "aktiv" : undefined} onClick={() => setValgt(ukeKey(u))}>
              Uke {u.uke} · {u.aar}
              <span className="antall" aria-label={`${u.klare} klare`}>
                {u.klare}
              </span>
              {u.problemer > 0 && (
                <span className="varsel" title={`${u.problemer} kan ikke legges inn`} aria-label={`${u.problemer} kan ikke legges inn`}>
                  !
                </span>
              )}
            </button>
          );
        })}
      </div>
      {skjultTekst && <p className="micro" style={{ marginBottom: 0 }}>Skjult: {skjultTekst}.</p>}
      {grupper.length ? (
        grupper.map((g) => (
          <div key={g.konsept}>
            <div className="sub-h">
              {g.konsept} ({g.rader.length})
            </div>
            {g.rader.map((r) => (
              <Video key={r.driveFileId} rad={r} rows={rows} heat={heat} regler={regler} today={today} pending={pending} run={run} />
            ))}
          </div>
        ))
      ) : (
        <p className="empty-state">Ingen videoer som kan legges inn i uke {uke.uke}.</p>
      )}
      {problemer.length > 0 && (
        <>
          <div className="sub-h">Kan ikke legges inn ({problemer.length})</div>
          {problemer.map((r) => (
            <div key={r.driveFileId} className="reason">
              <div>
                <strong>{r.filnavn}</strong>
                <p>
                  {r.konsept} · uke {r.uke} {r.aar} · {r.melding || "Ikke tolket."}
                </p>
              </div>
              <span className="pill warn">{r.tolkning}</span>
            </div>
          ))}
          <p className="micro">Rett gjestelisten, notatene eller filnavnet og kjør fetch_drive.py --skriv på nytt.</p>
        </>
      )}
    </div>
  );
}

function Video({ rad, rows, heat, regler, today, pending, run }: Omit<Props, "innboks"> & { rad: InnboksRad }) {
  const [plattformer, setPlattformer] = useState<string[]>(PLAN_PLATTFORMER.map((p) => p.key));
  const duplikat = muligDuplikat(rad, rows);
  const leggInn = () => {
    const nye = plasserFraInnboks(rad, plattformer, crypto.randomUUID(), rows, regler, heat, today);
    const ikke = nye.filter((n) => !n.dato).map((n) => `${label(n.plattform)} (${n.grunnlag.replace(/^Ikke plassert: /, "").replace(/\.$/, "")})`);
    const ok = `La inn «${rad.tittel}» i uke ${rad.uke}.${ikke.length ? ` Ikke plassert: ${ikke.join("; ")}. Flytt dem selv, eller fjern videoen.` : ""}`;
    run(() => leggTilFraDrive(rad.driveFileId, nye), ok);
  };
  return (
    <div className="reason innboks-rad">
      <div>
        <strong>{rad.tittel}</strong>
        <p>
          {rad.konsept} · uke {rad.uke} {rad.aar}
          {rad.konsept === "Folka Først" && rad.gjest && ` · ${rad.gjest}, ${rad.yrke}`}
        </p>
        {rad.skjelett && (
          <details className="more">
            <summary>Caption-skjelett</summary>
            <p className="skjelett">{rad.skjelett}</p>
          </details>
        )}
        <fieldset className="checks">
          <legend className="sr-only">Plattformer for {rad.tittel}</legend>
          {PLAN_PLATTFORMER.map((p) => (
            <label key={p.key}>
              <input
                type="checkbox"
                checked={plattformer.includes(p.key)}
                onChange={(e) => setPlattformer((cur) => (e.target.checked ? [...cur, p.key] : cur.filter((x) => x !== p.key)))}
              />
              {p.label}
            </label>
          ))}
        </fieldset>
        {duplikat && (
          <p className="break">
            Ser ut til å ligge i kalenderen allerede (lagt inn manuelt: «{duplikat.tittel}»). Legg inn bare hvis det er en annen video.
          </p>
        )}
      </div>
      <button type="button" className={duplikat ? "secondary" : "primary"} disabled={pending || !plattformer.length} onClick={leggInn}>
        {pending ? "Lagrer …" : duplikat ? "Legg inn likevel" : "Legg inn"}
      </button>
    </div>
  );
}
