"use client";

import { useState } from "react";
import { lagreCaption, lagreCaptions } from "@/app/(app)/publiseringstid/actions";
import {
  type CaptionVideo as Video,
  endret,
  etikett,
  gjeldende,
  gjenstaar,
  kopierTilAlle,
  lagretMelding,
  MAKS_CAPTION,
  startTekst,
  tegn,
  tilLagring,
  youtubeTittel,
} from "@/lib/plan/caption";
import type { PlanRad } from "@/lib/plan/ukeplan";
import { PLAN_PLATTFORMER } from "@/lib/regler/plattformer";

type Run = (job: () => Promise<{ ok: boolean; error?: string }>, ok: string) => void;

const label = (k: string) => PLAN_PLATTFORMER.find((p) => p.key === k)?.label ?? k;
const fmt = (n: number) => n.toLocaleString("nb-NO");

/** Captionene for én video: felt per plattform for redaktører, bare tekst for andre. */
export function CaptionVideo({ video, editor, pending, run }: { video: Video; editor: boolean; pending: boolean; run: Run }) {
  const [felt, setFelt] = useState<Record<string, string>>(() => Object.fromEntries(video.rader.map((r) => [r.id, startTekst(r)])));
  const ferdige = video.rader.filter((r) => gjeldende(r) && !gjenstaar(gjeldende(r)).length).length;
  const head = (
    <>
      <strong>{video.tittel}</strong> · {video.konsept}
      <span className="muted">
        {" "}
        · {ferdige} av {video.rader.length} ferdige
      </span>
    </>
  );

  if (!editor) {
    return (
      <div className="caption-video">
        <div className="caption-tittel">{head}</div>
        {video.rader.map((r) => {
          const tekst = gjeldende(r) ?? "";
          const rest = gjenstaar(tekst);
          return (
            <div key={r.id} className="caption-felt">
              <div className="caption-head">
                <strong>{label(r.plattform)}</strong>
                <span className={`pill ${r.captionTekst && !rest.length ? "" : "neutral"}`}>
                  {!r.captionTekst ? "Skjelett, ikke ferdig" : rest.length ? "Påbegynt, ikke ferdig" : "Caption (ferdig)"}
                </span>
              </div>
              <p className="skjelett">{tekst}</p>
              {rest.length > 0 && <p className="micro caption-rest">Gjenstår: {rest.join(", ")}</p>}
            </div>
          );
        })}
      </div>
    );
  }

  const sett = (id: string, t: string) => setFelt((f) => ({ ...f, [id]: t }));
  const lagre = (r: PlanRad) => {
    const tekst = tilLagring(felt[r.id] ?? "", r.captionSkjelett);
    run(() => lagreCaption(r.id, tekst), `${label(r.plattform)}: ${lagretMelding([{ rad: r, tekst }])}`);
  };
  const brukPaaAlle = (r: PlanRad) => {
    const tekst = felt[r.id] ?? "";
    const { lagre: liste, overskriver } = kopierTilAlle(r, tekst, video.rader, felt);
    if (overskriver.length && !window.confirm(`Overskriver teksten på ${overskriver.join(" og ")}. Fortsette?`)) return;
    setFelt(Object.fromEntries(video.rader.map((x) => [x.id, tekst])));
    const melding = lagretMelding(liste.map((l) => ({ rad: video.rader.find((x) => x.id === l.id) as PlanRad, tekst: l.tekst })));
    run(() => lagreCaptions(liste), melding);
  };

  return (
    <details className="caption-video" open={video.fraDrive}>
      <summary className="caption-tittel">{head}</summary>
      {video.rader.map((r) => {
        const verdi = felt[r.id] ?? "";
        const n = tegn(verdi);
        const over = n > MAKS_CAPTION;
        const rest = gjenstaar(verdi);
        const yt = r.plattform === "youtube" ? youtubeTittel(verdi) : null;
        const id = `caption-${r.id}`;
        return (
          <div key={r.id} className="caption-felt" id={id}>
            <div className="caption-head">
              <label htmlFor={`${id}-tekst`}>
                <strong>{label(r.plattform)}</strong>
              </label>
              <span className={`pill ${endret(verdi, r) ? "warn" : "neutral"}`}>{etikett(verdi, r)}</span>
              <span className="muted small">{r.status}</span>
            </div>
            <textarea id={`${id}-tekst`} rows={6} value={verdi} onChange={(e) => sett(r.id, e.target.value)} placeholder="Skriv caption" />
            <div className="caption-meta">
              <span className={over ? "for-lang" : undefined}>
                {fmt(n)} / {fmt(MAKS_CAPTION)} tegn
              </span>
              {rest.length > 0 && <span className="caption-rest">Gjenstår: {rest.join(", ")}</span>}
            </div>
            {yt && (
              <p className="micro" style={{ marginTop: 4 }}>
                Tittel på YouTube (første linje): «{yt.tittel}»
                {yt.advarsler.map((a) => (
                  <span key={a} className="caption-advarsel">
                    {" "}
                    {a}
                  </span>
                ))}
              </p>
            )}
            <div className="caption-knapper">
              <button type="button" className="primary" disabled={pending || over || !endret(verdi, r)} onClick={() => lagre(r)}>
                {pending ? "Lagrer …" : "Lagre"}
              </button>
              {video.rader.length > 1 && (
                <button type="button" className="secondary" disabled={pending || over} onClick={() => brukPaaAlle(r)}>
                  Bruk samme tekst på alle plattformene
                </button>
              )}
              {r.captionSkjelett && verdi !== r.captionSkjelett && (
                <button type="button" className="secondary" disabled={pending} onClick={() => sett(r.id, r.captionSkjelett as string)}>
                  Tilbake til skjelettet
                </button>
              )}
            </div>
            {r.captionSkjelett && (
              <details className="more">
                <summary>Vis skjelettet</summary>
                <p className="skjelett">{r.captionSkjelett}</p>
              </details>
            )}
          </div>
        );
      })}
    </details>
  );
}
