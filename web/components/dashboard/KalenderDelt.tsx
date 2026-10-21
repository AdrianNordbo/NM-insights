"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { fjernVideo, flyttPlassering, leggTilVideo, settStatus } from "@/app/(app)/publiseringstid/actions";
import { blokkFor, HEAT_MIN_N, type HeatSection, TIDSBLOKKER, UKEDAGER, UKEDAGER_LANG } from "@/lib/analyse/heatmap";
import type { ContentLatestRow } from "@/lib/data/types";
import { formatDayMonth, formatNumber, formatTimes } from "@/lib/format";
import { folgOpp, type LagretTest, trengerFlere } from "@/lib/plan/oppfolging";
import { isoUke, kommendeUker, lesUke, type Uke, ukeDager, ukeKey, ukeLabel } from "@/lib/plan/uke";
import { miks, miksAvvik, naar, type PlanRad, planCsv, plasserIUke, tittelFraFilnavn } from "@/lib/plan/ukeplan";
import { MAKS_TESTER_PER_UKE, OPPFOLGING_DAGER, ukedag } from "@/lib/plan/utkast";
import { KONSEPTBRUDD, laasPeriode } from "@/lib/regler/konsepter";
import { PLAN_KONSEPTER, STATUSER, TESTER_PER_UKE } from "@/lib/regler/plan";
import { PLAN_PLATTFORMER } from "@/lib/regler/plattformer";

type Props = { heat: Record<string, HeatSection>; rows: PlanRad[]; editor: boolean; today: string; followContent: ContentLatestRow[] };

const label = (k: string) => PLAN_PLATTFORMER.find((p) => p.key === k)?.label ?? k;

export function KalenderDelt({ heat, rows, editor, today, followContent }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [melding, setMelding] = useState<string | null>(null);
  const weeks = useMemo(() => {
    const keys = new Map<string, Uke>();
    for (const u of kommendeUker(today, 10)) keys.set(ukeKey(u), u);
    for (const r of rows) keys.set(ukeKey(r), { aar: r.aar, uke: r.uke });
    return [...keys.values()].sort((a, b) => a.aar - b.aar || a.uke - b.uke);
  }, [rows, today]);
  const [ukeKeyValgt, setUke] = useState(ukeKey(isoUke(today)));
  const uke = lesUke(ukeKeyValgt) ?? isoUke(today);
  const [regler, setRegler] = useState({ maxPerDay: 1, gapHours: 3, testsPerWeek: TESTER_PER_UKE });
  const [title, setTitle] = useState("");
  const [concept, setConcept] = useState<string>(PLAN_KONSEPTER[0]);
  const [platforms, setPlatforms] = useState<string[]>(PLAN_PLATTFORMER.map((p) => p.key));
  const ukeRader = rows.filter((r) => r.aar === uke.aar && r.uke === uke.uke);
  const b = KONSEPTBRUDD[0];
  const lock = b ? laasPeriode(b) : null;

  const run = (job: () => Promise<{ ok: boolean; error?: string }>, ok: string) =>
    start(async () => {
      const svar = await job();
      setMelding(svar.ok ? ok : (svar.error ?? "Klarte ikke å lagre."));
      if (svar.ok) router.refresh();
    });

  const leggTil = () => {
    if (!title.trim() || !platforms.length) return;
    const video = { id: crypto.randomUUID(), title: title.trim(), concept, platforms };
    const nye = plasserIUke(video, uke, rows, regler, heat, today);
    run(() => leggTilVideo(nye), `La inn «${video.title}» i ${ukeLabel(uke, today).split(" · ")[0].toLowerCase()}.`);
    setTitle("");
  };
  const download = (rader: PlanRad[], navn: string) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([planCsv(rader)], { type: "text/csv;charset=utf-8" }));
    a.download = navn;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const tester: (LagretTest & { status: string })[] = rows
    .filter((r) => r.merking === "Test" && r.dato && r.klokkeslett)
    .map((r) => ({
      videoId: r.videoId,
      title: r.tittel,
      concept: r.konsept,
      platform: r.plattform,
      platformLabel: label(r.plattform),
      date: r.dato as string,
      time: r.klokkeslett as string,
      weekday: ukedag(r.dato as string),
      block: Math.max(0, blokkFor(Number((r.klokkeslett as string).slice(0, 2)))),
      status: r.status,
    }));

  return (
    <>
      <div className="notice">
        <p>
          Den delte publiseringskalenderen. {editor ? "Du er redaktør: du legger inn videoene" : "Du ser kalenderen skrivebeskyttet. Redaktøren legger inn videoene"}{" "}
          og velger uke; utkastet velger dag og klokkeslett (Oslo-tid) innenfor uken for hver plattform, merket «Basert på data» eller «Test». Miks og antall endres
          aldri. Ingenting publiseres automatisk.
        </p>
      </div>

      <div className="filters" style={{ marginTop: 16 }}>
        <label className="select">
          <span className="sr-only">Uke</span>
          <select value={ukeKey(uke)} onChange={(e) => setUke(e.target.value)}>
            {weeks.map((w) => (
              <option key={ukeKey(w)} value={ukeKey(w)}>
                {ukeLabel(w, today)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {editor && (
        <div className="planning-grid">
          <div className="card">
            <h2>Legg til video</h2>
            <div className="sub">Tittel, type innhold, plattformer og uke. Du kan dra en videofil hit for å hente tittelen fra filnavnet.</div>
            <form
              className="videoform"
              onSubmit={(e) => {
                e.preventDefault();
                leggTil();
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) setTitle(tittelFraFilnavn(f.name));
              }}
            >
              <label>
                Tittel
                <input name="title" required maxLength={90} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Tittel, eller dra inn en videofil" />
              </label>
              <p className="micro" style={{ marginTop: 0 }}>
                Filen lastes ikke opp og leses ikke; bare navnet brukes som tittel.
              </p>
              <label>
                Type innhold
                <select value={concept} onChange={(e) => setConcept(e.target.value)}>
                  {PLAN_KONSEPTER.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <fieldset className="checks">
                <legend>Plattformer</legend>
                {PLAN_PLATTFORMER.map((p) => (
                  <label key={p.key}>
                    <input type="checkbox" checked={platforms.includes(p.key)} onChange={(e) => setPlatforms((cur) => (e.target.checked ? [...cur, p.key] : cur.filter((x) => x !== p.key)))} />
                    {p.label}
                  </label>
                ))}
              </fieldset>
              <label>
                Uke
                <select value={ukeKey(uke)} onChange={(e) => setUke(e.target.value)}>
                  {weeks.map((w) => (
                    <option key={ukeKey(w)} value={ukeKey(w)}>
                      {ukeLabel(w, today)}
                    </option>
                  ))}
                </select>
              </label>
              <button className="primary" type="submit" disabled={pending || !platforms.length || !title.trim()}>
                {pending ? "Lagrer …" : "Legg til og plasser"}
              </button>
            </form>
            {melding && (
              <p className="small" role="status" style={{ marginTop: 10 }}>
                {melding}
              </p>
            )}
          </div>
          <div className="card">
            <h2>Regler for plasseringen</h2>
            <div className="sub">Gjelder per plattform, innenfor valgt uke</div>
            {(
              [
                ["maxPerDay", "Maks per dag per plattform", [[1, "1 video"], [2, "2 videoer"], [3, "3 videoer"]]],
                ["gapHours", "Minste mellomrom", [[0, "Ingen"], [3, "3 timer"], [6, "6 timer"]]],
                ["testsPerWeek", "Tester per plattform og uke", [[0, "Ingen"], [1, "1 test"], [2, `${MAKS_TESTER_PER_UKE} tester (maks)`]]],
              ] as ["maxPerDay" | "gapHours" | "testsPerWeek", string, [number, string][]][]
            ).map(([k, l, opts]) => (
              <div key={k} className="setting">
                <label htmlFor={`d-${k}`}>{l}</label>
                <select id={`d-${k}`} value={String(regler[k])} onChange={(e) => setRegler((r) => ({ ...r, [k]: Number(e.target.value) }))}>
                  {opts.map(([v, t]) => (
                    <option key={v} value={v}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <div className="method">
              <strong>Slik velges dag og klokkeslett</strong>
              <p>
                Hver plattform får den første ledige dagen i uken der samme type innhold har minst {HEAT_MIN_N} innlegg i tidsrommet, på klokkeslettet som er brukt der
                før; de andre plattformene samme dag der det er mulig. Er det plass til en test, flyttes videoen til et kveldstidsrom samme ukedag som mangler tall.
                {b && lock && ` ${b.concept} holder fast tidspunkt på alle plattformer fra ${formatDayMonth(lock.from)} til ${formatDayMonth(lock.to)} (${b.reason}).`} Er
                uken full, blir videoen stående som ikke plassert i uken; den flyttes aldri til en annen uke. Videoer som allerede ligger i kalenderen flyttes ikke.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: editor ? 0 : 17 }}>
        <div className="splithead">
          <div>
            <h2>{ukeLabel(uke, today)}</h2>
            <div className="sub">
              Miks:{" "}
              {miks(uke, rows)
                .map((m) => `${m.konsept} ${m.har}/${m.skal}`)
                .join(" · ")}
            </div>
          </div>
          <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {ukeRader.length > 0 && (
              <button type="button" className="secondary" onClick={() => download(ukeRader, `publiseringsplan-${ukeKey(uke)}.csv`)}>
                Last ned CSV (uken)
              </button>
            )}
            {rows.length > 0 && (
              <button type="button" className="secondary" onClick={() => download(rows, "publiseringsplan.csv")}>
                Last ned CSV (alt)
              </button>
            )}
          </span>
        </div>
        {miksAvvik(uke, rows).map((a) => (
          <p key={a} className="break" style={{ marginTop: 0, marginBottom: 8 }}>
            {a}
          </p>
        ))}
        <div className="calendar">
          {ukeDager(uke).map((d) => {
            const items = ukeRader.filter((r) => r.dato === d).sort((x, y) => (x.klokkeslett ?? "").localeCompare(y.klokkeslett ?? ""));
            return (
              <div key={d} className={d <= today ? "calendar-day outside" : "calendar-day"}>
                <div className="day-head">
                  <b>{UKEDAGER[ukedag(d)]}</b>
                  <small>{formatDayMonth(d)}</small>
                </div>
                {items.map((r) => (
                  <div key={r.id} className={r.merking === "Test" ? "slot test" : "slot"}>
                    <small>
                      {r.klokkeslett} · {label(r.plattform)}
                    </small>
                    <strong>{r.tittel}</strong>
                    <em>
                      {r.konsept} · {r.merking}
                      {r.flyttetManuelt && " · flyttet manuelt"} · {r.status}
                    </em>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
        {ukeRader.some((r) => !r.dato) && (
          <p className="micro" style={{ color: "var(--down)" }}>
            Ikke plassert i uken:{" "}
            {ukeRader
              .filter((r) => !r.dato)
              .map((r) => `${r.tittel} på ${label(r.plattform)}`)
              .join("; ")}
            . Uken er full for disse; de flyttes ikke til en annen uke.
          </p>
        )}
        {!ukeRader.length && <p className="empty-state">Ingen videoer i denne uken ennå.</p>}

        {ukeRader.length > 0 && (
          <div className="plan-explanation">
            <h3>Plasseringene</h3>
            {ukeRader
              .slice()
              .sort((x, y) => (x.dato ?? "9").localeCompare(y.dato ?? "9") || (x.klokkeslett ?? "").localeCompare(y.klokkeslett ?? ""))
              .map((r) => (
                <div key={r.id} className="reason">
                  <div>
                    <strong>
                      {r.tittel} · {label(r.plattform)} · {naar(r)}
                    </strong>
                    <p>
                      {r.konsept} · {r.grunnlag}
                      {r.flyttetManuelt && " Flyttet manuelt."}
                    </p>
                    {editor && <Redigering rad={r} uke={uke} pending={pending} run={run} />}
                  </div>
                  <span style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    {r.merking && <span className={`cat ${r.merking === "Test" ? "prov" : "data"}`}>{r.merking}</span>}
                    {r.flyttetManuelt && <span className="pill neutral">Flyttet manuelt</span>}
                    <span className={`pill ${r.status === "Publisert" ? "" : r.status === "Klar" ? "test" : "neutral"}`}>{r.status}</span>
                  </span>
                </div>
              ))}
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 17 }}>
        <h2>Oppfølging av tester</h2>
        <div className="sub">Etter {OPPFOLGING_DAGER} dager, når innlegget regnes som modent</div>
        <ol className="steps">
          <li>Del videoens visninger på medianen for samme type innhold på samme plattform. Det gir «ganger vanlig».</li>
          <li>Ett testinnlegg er ett datapunkt. Cellen i heatmapet blir farget først ved {HEAT_MIN_N} innlegg; først da kan tidsrommet brukes som «Basert på data».</li>
          <li>Over 1,15 ganger vanlig er lovende, men et enkelt innlegg kan skyldes innholdet. Gjenta testen før dere endrer fast tidspunkt.</li>
        </ol>
        <div className="sub-h">Tester i kalenderen</div>
        {tester.length ? (
          tester.map((t) => {
            const s = folgOpp(t, followContent, heat, today);
            return (
              <div key={`${t.videoId}-${t.platform}`} className="reason">
                <div>
                  <strong>
                    {t.title} · {t.platformLabel} · {UKEDAGER_LANG[t.weekday]} {formatDayMonth(t.date)} kl. {t.time} ({TIDSBLOKKER[t.block].label})
                  </strong>
                  <p>
                    {s.kind === "planlagt" && `Planlagt. Følges opp ${formatDayMonth(s.ready)}.`}
                    {s.kind === "ikke funnet" && "Fant ikke et innlegg med samme type innhold på plattformen innen én dag fra planlagt dato."}
                    {s.kind === "venter" && `Publisert ${formatDayMonth(s.post.published)} («${s.post.title}»). Klar ${formatDayMonth(s.ready)}.`}
                    {s.kind === "klar" &&
                      `«${s.post.title}»: ${formatNumber(s.post.views)} visninger mot median ${formatNumber(s.conceptMedian)} = ${formatTimes(s.ratio)} ganger vanlig. Tidsrommet har ${s.cellN} av ${HEAT_MIN_N} innlegg${trengerFlere(s.cellN) ? `; ${trengerFlere(s.cellN)} til før det kan brukes som «Basert på data»` : ""}.`}
                  </p>
                </div>
                <span className={`pill ${s.kind === "klar" ? (s.lovende ? "" : "neutral") : "test"}`}>{s.kind === "klar" ? (s.lovende ? "lovende" : "ikke lovende") : s.kind}</span>
              </div>
            );
          })
        ) : (
          <p className="muted small">Ingen tester i kalenderen.</p>
        )}
      </div>
    </>
  );
}

/** Status og flytting for én plassering (bare for redaktører). */
function Redigering({
  rad,
  uke,
  pending,
  run,
}: {
  rad: PlanRad;
  uke: Uke;
  pending: boolean;
  run: (job: () => Promise<{ ok: boolean; error?: string }>, ok: string) => void;
}) {
  const [dato, setDato] = useState(rad.dato ?? ukeDager(uke)[0]);
  const [kl, setKl] = useState(rad.klokkeslett ?? "19:00");
  return (
    <details className="more">
      <summary>Endre</summary>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
        <label className="select">
          <span className="sr-only">Status</span>
          <select value={rad.status} disabled={pending} onChange={(e) => run(() => settStatus(rad.id, e.target.value), `Status satt til ${e.target.value}.`)}>
            {STATUSER.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="select">
          <span className="sr-only">Dag</span>
          <select value={dato} onChange={(e) => setDato(e.target.value)}>
            {ukeDager(uke).map((d) => (
              <option key={d} value={d}>
                {UKEDAGER_LANG[ukedag(d)]} {formatDayMonth(d)}
              </option>
            ))}
          </select>
        </label>
        <input type="time" value={kl} onChange={(e) => setKl(e.target.value)} aria-label="Klokkeslett" style={{ minHeight: 42, borderRadius: 8, border: "1px solid var(--line)", padding: "8px 10px", font: "inherit", background: "var(--surface)", color: "var(--ink)" }} />
        <button type="button" className="secondary" disabled={pending} onClick={() => run(() => flyttPlassering(rad.id, rad.aar, rad.uke, dato, kl), "Flyttet.")}>
          Flytt
        </button>
        <button type="button" className="remove" disabled={pending} onClick={() => run(() => fjernVideo(rad.videoId), `Fjernet «${rad.tittel}» (alle plattformer).`)}>
          Fjern video
        </button>
      </div>
    </details>
  );
}
