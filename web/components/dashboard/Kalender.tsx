"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { HEAT_MIN_N, type HeatSection, TIDSBLOKKER, UKEDAGER, UKEDAGER_LANG } from "@/lib/analyse/heatmap";
import type { ContentLatestRow } from "@/lib/data/types";
import { addDays, formatDayMonth, formatNumber, formatTimes } from "@/lib/format";
import { KONSEPTBRUDD, laasPeriode } from "@/lib/regler/konsepter";
import { TESTER_PER_UKE } from "@/lib/regler/plan";
import { PLAN_PLATTFORMER } from "@/lib/regler/plattformer";
import { eksempel, folgOpp, type LagretTest, trengerFlere } from "@/lib/plan/oppfolging";
import { type KoVideo, lagUtkast, MAKS_TESTER_PER_UKE, OPPFOLGING_DAGER, type Regler, ukedag, ukeStart, utkastCsv } from "@/lib/plan/utkast";

const KO_KEY = "nm-insights-ko-v1";
const TEST_KEY = "nm-insights-tester-v1";

/** Køen og testene ligger i nettleseren (localStorage). Ingen lagring på serveren i denne versjonen. */
const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}
function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* privat modus o.l.: utkastet virker, men lagres ikke */
  }
  listeners.forEach((l) => l());
}
function useStored<T>(key: string): T[] {
  const raw = useSyncExternalStore(subscribe, () => read(key), () => null);
  return useMemo(() => {
    try {
      const v = raw ? JSON.parse(raw) : [];
      return Array.isArray(v) ? (v as T[]) : [];
    } catch {
      return [];
    }
  }, [raw]);
}

export function Kalender({ heat, concepts, followContent, today }: { heat: Record<string, HeatSection>; concepts: string[]; followContent: ContentLatestRow[]; today: string }) {
  const queue = useStored<KoVideo>(KO_KEY);
  const tests = useStored<LagretTest>(TEST_KEY);
  const [regler, setRegler] = useState<Regler>({ start: addDays(today, 1), horizon: 14, maxPerDay: 1, gapHours: 3, testsPerWeek: TESTER_PER_UKE });
  const [made, setMade] = useState(false);
  const [platforms, setPlatforms] = useState<string[]>(PLAN_PLATTFORMER.map((p) => p.key));
  const plan = useMemo(() => (made ? lagUtkast(queue, regler, heat, today) : null), [made, queue, regler, heat, today]);
  const b = KONSEPTBRUDD[0];
  const lock = b ? laasPeriode(b) : null;
  const ex = useMemo(() => eksempel(followContent, heat), [followContent, heat]);

  const addVideo = (form: HTMLFormElement) => {
    const d = new FormData(form);
    const title = String(d.get("title") ?? "").trim();
    if (!title || !platforms.length) return;
    write(KO_KEY, [...queue, { id: `${Date.now()}-${queue.length}`, title, concept: String(d.get("concept")), platforms }]);
    form.reset();
  };
  const set = (k: keyof Regler, v: string) => setRegler((r) => ({ ...r, [k]: k === "start" ? v : Number(v) }));
  const download = () => {
    if (!plan) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([utkastCsv(plan.placed)], { type: "text/csv;charset=utf-8" }));
    a.download = `publiseringsplan-utkast-${plan.days[0]}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const planTests = plan?.placed.filter((p) => p.kind === "Test") ?? [];
  const saveTests = () => {
    const key = (t: LagretTest) => `${t.videoId}|${t.platform}|${t.date}`;
    const known = new Set(tests.map(key));
    write(TEST_KEY, [
      ...tests,
      ...planTests.filter((t) => !known.has(key(t))).map(({ videoId, title, concept, platform, platformLabel, date, time, weekday, block }) => ({ videoId, title, concept, platform, platformLabel, date, time, weekday, block })),
    ]);
  };

  return (
    <>
      <div className="notice">
        <p>
          Et utkast du vurderer selv. Du bestemmer hvilke videoer og hvor mange; utkastet velger bare dag og klokkeslett (Oslo-tid) for hver plattform. Hver plassering er
          merket «Basert på data» (tidsrom med minst {HEAT_MIN_N} innlegg for samme type innhold på plattformen) eller «Test» (tidsrom uten nok tall, maks{" "}
          {MAKS_TESTER_PER_UKE} per plattform og uke). Ingenting publiseres automatisk.
        </p>
      </div>

      <div className="planning-grid">
        <div className="card">
          <h2>1 · Videoer som skal ut</h2>
          <div className="sub">Tittel, type innhold og plattformer</div>
          <form
            className="videoform"
            onSubmit={(e) => {
              e.preventDefault();
              addVideo(e.currentTarget);
            }}
          >
            <label>
              Tittel
              <input name="title" required maxLength={90} placeholder="Tittel på videoen" />
            </label>
            <label>
              Type innhold
              <select name="concept">
                {concepts.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <fieldset className="checks">
              <legend>Plattformer</legend>
              {PLAN_PLATTFORMER.map((p) => (
                <label key={p.key}>
                  <input
                    type="checkbox"
                    checked={platforms.includes(p.key)}
                    onChange={(e) => setPlatforms((cur) => (e.target.checked ? [...cur, p.key] : cur.filter((x) => x !== p.key)))}
                  />
                  {p.label}
                </label>
              ))}
            </fieldset>
            <button className="primary" type="submit" disabled={!platforms.length}>
              Legg til
            </button>
          </form>
          <div className="queue-title">
            <strong>I køen</strong>
            <span className="tinybadge">
              {queue.length} {queue.length === 1 ? "video" : "videoer"}
            </span>
          </div>
          <div className="queue">
            {queue.length ? (
              queue.map((v) => (
                <div key={v.id} className="queue-item">
                  <div>
                    <strong>{v.title}</strong>
                    <small>
                      {v.concept} · {PLAN_PLATTFORMER.filter((p) => v.platforms.includes(p.key)).map((p) => p.label).join(", ")}
                    </small>
                  </div>
                  <button type="button" className="remove" aria-label={`Fjern ${v.title}`} onClick={() => write(KO_KEY, queue.filter((x) => x.id !== v.id))}>
                    Fjern
                  </button>
                </div>
              ))
            ) : (
              <div className="empty-queue">Ingen videoer ennå. Legg inn videoene som er klare.</div>
            )}
          </div>
        </div>

        <div className="card">
          <h2>2 · Regler for utkastet</h2>
          <div className="sub">Maks per dag og mellomrom gjelder per plattform</div>
          <div className="setting">
            <label htmlFor="k-start">Første dag</label>
            <input id="k-start" type="date" min={addDays(today, 1)} value={regler.start} onChange={(e) => set("start", e.target.value)} />
          </div>
          {(
            [
              ["horizon", "Periode", [[14, "14 dager"], [21, "21 dager"], [28, "28 dager"]]],
              ["maxPerDay", "Maks per dag per plattform", [[1, "1 video"], [2, "2 videoer"], [3, "3 videoer"]]],
              ["gapHours", "Minste mellomrom", [[0, "Ingen"], [3, "3 timer"], [6, "6 timer"]]],
              ["testsPerWeek", "Tester per plattform og uke", [[0, "Ingen"], [1, "1 test"], [2, "2 tester (maks)"]]],
            ] as [keyof Regler, string, [number, string][]][]
          ).map(([k, label, opts]) => (
            <div key={k} className="setting">
              <label htmlFor={`k-${k}`}>{label}</label>
              <select id={`k-${k}`} value={String(regler[k])} onChange={(e) => set(k, e.target.value)}>
                {opts.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <button className="primary full" type="button" onClick={() => setMade(true)}>
            Lag utkast
          </button>
          <div className="method">
            <strong>Slik velges dag og klokkeslett</strong>
            <p>
              Hver plattform får den første ledige dagen i perioden der samme type innhold har minst {HEAT_MIN_N} innlegg i tidsrommet på den plattformen, på klokkeslettet
              som er brukt der før. De andre plattformene får samme dag der det er mulig. Er det plass til en test den uken, flyttes videoen til et kveldstidsrom samme
              ukedag som mangler tall.
              {b && lock && ` ${b.concept} holder fast tidspunkt på alle plattformer fra ${formatDayMonth(lock.from)} til ${formatDayMonth(lock.to)} (${b.reason}), og testene legges på andre typer innhold.`}{" "}
              Rekkefølgen er køens rekkefølge.
            </p>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="splithead">
          <div>
            <h2>3 · Utkast til publiseringsplan</h2>
            <div className="sub">
              {plan
                ? `${formatDayMonth(plan.days[0])}–${formatDayMonth(plan.days.at(-1) as string)} · ${plan.placed.length} plasseringer · Oslo-tid`
                : "Trykk «Lag utkast» når køen er klar."}
            </div>
          </div>
          {plan && plan.placed.length > 0 && (
            <button type="button" className="secondary" onClick={download}>
              Last ned CSV
            </button>
          )}
        </div>
        {plan && <Kalendergrid days={plan.days} placed={plan.placed} />}
        {plan && plan.unplaced.length > 0 && (
          <p className="micro" style={{ color: "var(--down)" }}>
            Fikk ikke plass: {plan.unplaced.map((u) => `${u.video.title} på ${u.platform.label} (${u.reason})`).join("; ")}. Gjør perioden lengre, eller tillat flere per dag.
          </p>
        )}
        {plan && plan.placed.length > 0 && (
          <div className="plan-explanation">
            <h3>Hvorfor her?</h3>
            {plan.placed.map((p) => (
              <div key={`${p.videoId}-${p.platform}`} className="reason">
                <div>
                  <strong>
                    {p.title} · {p.platformLabel} · {UKEDAGER_LANG[p.weekday]} {formatDayMonth(p.date)} kl. {p.time}
                  </strong>
                  <p>{p.why}</p>
                </div>
                <span className={`cat ${p.kind === "Test" ? "prov" : "data"}`}>{p.kind}</span>
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
          <li>
            Ett testinnlegg er ett datapunkt. Cellen i heatmapet blir farget først når den har minst {HEAT_MIN_N} innlegg, og først da kan tidsrommet brukes som «Basert på
            data».
          </li>
          <li>Over 1,15 ganger vanlig er lovende, men et enkelt innlegg kan skyldes innholdet. Gjenta testen før dere endrer fast tidspunkt.</li>
        </ol>
        {ex && (
          <div className="example">
            <b>Eksempel med ekte tall (et innlegg i et tidsrom med få tall):</b> {ex.concept} på {ex.platformLabel}, {UKEDAGER_LANG[ex.weekday]} {formatDayMonth(ex.published)} kl.{" "}
            {ex.time}: {formatNumber(ex.views)} visninger mot median {formatNumber(ex.conceptMedian)} for {ex.concept} = {formatTimes(ex.ratio)} ganger vanlig. Tidsrommet{" "}
            {UKEDAGER_LANG[ex.weekday]} {TIDSBLOKKER[ex.block].label} har {ex.cellN} av {HEAT_MIN_N} innlegg for {ex.concept}, så cellen er fortsatt grå.
          </div>
        )}
        {planTests.length > 0 && (
          <p style={{ marginTop: 14 }}>
            <button type="button" className="secondary" onClick={saveTests}>
              Lagre testene i utkastet til oppfølging ({planTests.length})
            </button>
          </p>
        )}
        <div className="sub-h">Lagrede tester</div>
        {tests.length ? (
          tests.map((t) => {
            const s = folgOpp(t, followContent, heat, today);
            return (
              <div key={`${t.videoId}-${t.platform}-${t.date}`} className="reason">
                <div>
                  <strong>
                    {t.title} · {t.platformLabel} · {UKEDAGER_LANG[t.weekday]} {formatDayMonth(t.date)} kl. {t.time} ({TIDSBLOKKER[t.block].label})
                  </strong>
                  <p>
                    {s.kind === "planlagt" && `Planlagt. Følges opp ${formatDayMonth(s.ready)}.`}
                    {s.kind === "ikke funnet" && "Fant ikke et innlegg med samme type innhold på plattformen innen én dag fra planlagt dato."}
                    {s.kind === "venter" && `Publisert ${formatDayMonth(s.post.published)} («${s.post.title}»). Klar ${formatDayMonth(s.ready)}, når innlegget er 7 dager.`}
                    {s.kind === "klar" &&
                      `«${s.post.title}»: ${formatNumber(s.post.views)} visninger mot median ${formatNumber(s.conceptMedian)} = ${formatTimes(s.ratio)} ganger vanlig. Tidsrommet har ${s.cellN} av ${HEAT_MIN_N} innlegg${trengerFlere(s.cellN) ? `; ${trengerFlere(s.cellN)} til før det kan brukes som «Basert på data»` : ""}.`}
                  </p>
                </div>
                <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span className={`pill ${s.kind === "klar" ? (s.lovende ? "" : "neutral") : "test"}`}>
                    {s.kind === "klar" ? (s.lovende ? "lovende" : "ikke lovende") : s.kind}
                  </span>
                  <button
                    type="button"
                    className="remove"
                    aria-label={`Fjern testen ${t.title}`}
                    onClick={() => write(TEST_KEY, tests.filter((x) => !(x.videoId === t.videoId && x.platform === t.platform && x.date === t.date)))}
                  >
                    Fjern
                  </button>
                </span>
              </div>
            );
          })
        ) : (
          <p className="muted small">Ingen lagrede tester. Lag et utkast med tester og lagre dem her for å følge dem opp.</p>
        )}
      </div>
    </>
  );
}

function Kalendergrid({ days, placed }: { days: string[]; placed: ReturnType<typeof lagUtkast>["placed"] }) {
  const first = ukeStart(days[0]);
  const last = days.at(-1) as string;
  const cells: string[] = [];
  for (let d = first; d <= addDays(ukeStart(last), 6); d = addDays(d, 1)) cells.push(d);
  return (
    <div className="calendar">
      {cells.map((d) => {
        const outside = d < days[0] || d > last;
        const items = placed.filter((p) => p.date === d);
        return (
          <div key={d} className={outside ? "calendar-day outside" : "calendar-day"}>
            <div className="day-head">
              <b>{UKEDAGER[ukedag(d)]}</b>
              <small>{formatDayMonth(d)}</small>
            </div>
            {items.map((p) => (
              <div key={`${p.videoId}-${p.platform}`} className={p.kind === "Test" ? "slot test" : "slot"}>
                <small>
                  {p.time} · {p.platformLabel}
                </small>
                <strong>{p.title}</strong>
                <em>
                  {p.concept} · {p.kind}
                </em>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
