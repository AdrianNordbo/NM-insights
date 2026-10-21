import Link from "next/link";
import { HEAT_MIN_N, type HeatSection, TIDSBLOKKER, UKEDAGER, UKEDAGER_LANG } from "@/lib/analyse/heatmap";
import { KATEGORI, LABEL_NAME, type MonsterCard, type MonsterSection, PROV_MAX, visteKort } from "@/lib/analyse/monstre";
import type { ContentLatestRow } from "@/lib/data/types";
import { formatDayMonth, formatTimes } from "@/lib/format";
import { FORMAT_NAME, PLATFORM_NAME } from "@/lib/navn";
import { KONSEPTBRUDD } from "@/lib/regler/konsepter";
import type { PlattformValgDef } from "@/lib/regler/plattformer";
import type { PlanRad } from "@/lib/plan/ukeplan";
import type { Visning } from "@/lib/sider";
import { Filtre } from "./Filtre";
import { bruddTekst } from "./InnholdsserierVisning";
import { Kalender } from "./Kalender";
import { KalenderDelt } from "./KalenderDelt";
import { KonseptVelger } from "./KonseptVelger";

type Option = { key: string; label: string };
const BANK = "Bankinfo (Veksthusets egne informasjons- og reklameinnlegg) er med i totalene og kontotallene, men ikke i konsepter, anbefalinger, mønstre, medianer eller innleggslistene.";
const FANER: { key: Visning; label: string }[] = [
  { key: "monstre", label: "Mønstre" },
  { key: "heatmap", label: "Heatmap" },
  { key: "kalender", label: "Kalender" },
];

export type PubliseringstidProps = {
  valg: PlattformValgDef;
  plattformer: Option[];
  visning: Visning;
  sections: MonsterSection[];
  heat: HeatSection[];
  konsept: string;
  concepts: string[];
  planHeat: Record<string, HeatSection>;
  planConcepts: string[];
  followContent: ContentLatestRow[];
  plan: { rows: PlanRad[] | null; editor: boolean };
  today: string;
};

const sectionName = (h: { platform: HeatSection["platform"]; format: HeatSection["format"] }) => `${PLATFORM_NAME[h.platform]} · ${FORMAT_NAME[h.format]}`;

export function PubliseringstidVisning(p: PubliseringstidProps) {
  const href = (visning: Visning) => `/publiseringstid?plattform=${p.valg.key}&visning=${visning}`;
  return (
    <>
      <div className="top">
        <div>
          <div className="eyebrow">Veksthuset</div>
          <h1>Publiseringstid</h1>
          <div className="sub">Mønstre, heatmap og et utkast til publiseringsplan per plattform og format. Alt bygger på egne tall og er hypoteser, ikke bevis.</div>
        </div>
        <Filtre plattformer={p.plattformer} plattform={p.valg.key} extra={{ visning: p.visning }} />
      </div>
      <nav className="seg" aria-label="Visning">
        {FANER.map((f) => (
          <Link key={f.key} href={href(f.key)} aria-current={p.visning === f.key ? "page" : undefined} scroll={false}>
            {f.label}
          </Link>
        ))}
      </nav>
      {p.visning === "monstre" && <MonstreFane {...p} />}
      {p.visning === "heatmap" && <HeatmapFane {...p} />}
      {p.visning === "kalender" && (
        p.plan.rows ? (
          <KalenderDelt heat={p.planHeat} rows={p.plan.rows} editor={p.plan.editor} today={p.today} followContent={p.followContent} />
        ) : (
          <>
            <p className="notice">Den delte kalenderen er ikke satt opp ennå. Utkastet under lagres bare i denne nettleseren.</p>
            <Kalender heat={p.planHeat} concepts={p.planConcepts} followContent={p.followContent} today={p.today} />
          </>
        )
      )}
    </>
  );
}

function MonsterKort({ c }: { c: MonsterCard }) {
  const d = c.details;
  return (
    <article className="card monster">
      <div className="badges">
        <span className={`cat ${KATEGORI[c.label] === "Prøv" ? "prov" : "data"}`}>{KATEGORI[c.label]}</span>
        {c.label !== "prøv" && <span className={`pill ${c.label === "sikkert" ? "" : "neutral"}`}>{LABEL_NAME[c.label]}</span>}
      </div>
      <h3>{c.advice}</h3>
      <p className="numbers">{c.numbers}</p>
      <p className="hyp">{c.label === "prøv" ? "Hypotese å teste, ikke bevis." : "Hypotese fra egne tall, ikke bevis."}</p>
      <details className="more">
        <summary>Vis detaljer</summary>
        <ul>
          {d.concepts.map((x) => (
            <li key={x.name}>
              <span>
                {x.name} {x.preliminary && <span className="pill warn">foreløpig</span>}
              </span>
              <span className="muted">{x.line}</span>
              {x.tidstrend && <span className="trend">{x.tidstrend}</span>}
            </li>
          ))}
        </ul>
        {[d.basis, d.suggestion, d.why.length ? `Bare «Prøv» fordi ${d.why.join("; ")}.` : null, d.note]
          .filter(Boolean)
          .map((t) => (
            <p key={t}>{t}</p>
          ))}
      </details>
    </article>
  );
}

function MonstreFane(p: PubliseringstidProps) {
  return (
    <>
      <div className="notice">
        <p>
          Et mønster sier at innlegg med en egenskap har fått flere visninger enn vanlig for samme type innhold. Det betyr ikke at egenskapen er årsaken. «Basert på
          data» har nok innlegg bak seg til å brukes i planleggingen; «Prøv» er et forslag til en test.
        </p>
      </div>
      {p.valg.key === "instagram-feed" && (
        <section className="block">
          <h2 className="plat p-instagram">Instagram · Feed</h2>
          <p className="muted">Mønstrene dekker Reels, Shorts og TikTok-videoer. Feed er ikke med i analysen.</p>
        </section>
      )}
      {p.sections.map((s) => {
        const v = visteKort(s);
        return (
          <section key={`${s.platform}-${s.format}`} className="block" aria-labelledby={`m-${s.id}`}>
            <h2 id={`m-${s.id}`} className={`plat p-${s.platform}`}>
              {s.name}
            </h2>
            <div className="sub">{s.basis}</div>
            <div className="sub-h">Basert på data</div>
            {v.data.length ? (
              <div className="mgrid">
                {v.data.map((c) => (
                  <MonsterKort key={c.id} c={c} />
                ))}
              </div>
            ) : (
              <p className="muted">Ingen mønstre med nok grunnlag ennå.</p>
            )}
            <div className="sub-h">
              Prøv{v.provTotalt > PROV_MAX ? ` (${PROV_MAX} av ${v.provTotalt})` : ""}
            </div>
            {v.prov.length ? (
              <div className="mgrid">
                {v.prov.map((c) => (
                  <MonsterKort key={c.id} c={c} />
                ))}
              </div>
            ) : (
              <p className="muted">Ingen forslag å teste ennå.</p>
            )}
          </section>
        );
      })}
      {!p.sections.length && p.valg.key !== "instagram-feed" && <p className="empty-state">Ingen mønstre ennå.</p>}
      <details className="card help">
        <summary>Slik leser du tallene</summary>
        <ul>
          <li>«1,30 ganger vanlig» betyr 30 % flere visninger enn vanlig for samme type innhold på samme plattform. Typen innhold holdes dermed lik.</li>
          <li>
            <b>Basert på data</b>: minst 10 innlegg, og minst to typer innhold viser det samme uten at noen viser det motsatte. «Tydelig mønster» er minst 1,20 ganger vanlig,
            «Svakt mønster» under. <b>Prøv</b>: lovende, men for lite grunnlag. Maks {PROV_MAX} forslag vises per plattform og format.
          </li>
          <li>Visningstallene er levetidstall, så eldre innlegg har hatt mer tid. VM og andre spesielle hendelser, og innlegg yngre enn 7 dager, er utelatt.</li>
          <li>{BANK}</li>
          <li>{bruddTekst()}</li>
          <li>Kanalen kan ha vokst over tid. Et tidsrom som bare er brukt i en del av perioden er merket «mulig tidstrend» og teller ikke med.</li>
        </ul>
      </details>
    </>
  );
}

function cellStyle(median: number) {
  const a = Math.max(0.08, Math.min(0.9, (median - 0.4) / 1.6));
  return { background: `rgba(var(--heat-rgb), ${a.toFixed(2)})`, color: a > 0.5 ? "#fff" : "var(--ink)" };
}

function HeatGrid({ h, konsept }: { h: HeatSection; konsept: string }) {
  const g = h.grids[konsept];
  if (!g) return <p className="muted">Ingen modne innlegg for {konsept} på {sectionName(h)}.</p>;
  return (
    <div className="heat" role="table" aria-label={`Heatmap ${sectionName(h)}`}>
      <div role="columnheader" />
      {UKEDAGER.map((d) => (
        <div key={d} className="hd" role="columnheader">
          {d}
        </div>
      ))}
      {TIDSBLOKKER.map((b, bi) => (
        <div key={b.key} style={{ display: "contents" }} role="row">
          <div className="hl" role="rowheader">
            {b.label}
          </div>
          {g.map((row, wd) => {
            const c = row[bi];
            const enough = c.n >= HEAT_MIN_N && c.median != null;
            const title = `${UKEDAGER_LANG[wd]} ${b.label}: ${c.n} innlegg${enough ? `, ${formatTimes(c.median as number)} ganger vanlig` : c.n ? ", for få til et tall" : ""}`;
            return (
              <div key={wd} className={enough ? "cell" : "cell empty"} title={title} role="cell" style={enough ? cellStyle(c.median as number) : undefined}>
                <b>{enough ? formatTimes(c.median as number) : "–"}</b>
                <small>{c.n} innl.</small>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function HeatmapFane(p: PubliseringstidProps) {
  const b = KONSEPTBRUDD[0];
  const options = [{ key: "alle", label: "Alle typer innhold" }, ...p.concepts.map((c) => ({ key: c, label: b && c === b.concept ? `${c} (før ${formatDayMonth(b.from)})` : c }))];
  return (
    <>
      <div className="notice">
        <p>
          Hver celle viser medianen av «visninger delt på medianen for samme type innhold» for innlegg publisert den ukedagen og i det tidsrommet (Oslo-tid). 1,00 er
          vanlig for typen innhold. Celler med færre enn {HEAT_MIN_N} innlegg er grå og viser bare antallet.
        </p>
      </div>
      <div style={{ marginTop: 16 }}>
        <KonseptVelger options={options} value={p.konsept} />
      </div>
      {p.heat.map((h) => (
        <section key={`${h.platform}-${h.format}`} className="block" aria-labelledby={`h-${h.platform}-${h.format}`}>
          <h2 id={`h-${h.platform}-${h.format}`} className={`plat p-${h.platform}`}>
            {sectionName(h)}
          </h2>
          <div className="sub">
            {h.n} modne innlegg{h.concepts.length ? `: ${h.concepts.map((c) => `${c} ${h.conceptPosts[c]}`).join(" · ")}` : ""}
          </div>
          <div className="card" style={{ marginTop: 12 }}>
            <HeatGrid h={h} konsept={p.konsept} />
            <div className="legendline">
              <span>
                <i className="dot" style={{ background: "rgba(var(--heat-rgb), .15)" }} />
                under vanlig
              </span>
              <span>
                <i className="dot" style={{ background: "rgba(var(--heat-rgb), .45)" }} />
                rundt vanlig
              </span>
              <span>
                <i className="dot" style={{ background: "rgba(var(--heat-rgb), .85)" }} />
                over vanlig
              </span>
              <span>
                <i className="dot grey" />
                færre enn {HEAT_MIN_N} innlegg
              </span>
            </div>
            <p className="micro">
              Dette er et mønster i egne tall, ikke bevis. Typene innhold har faste publiseringsdager, så ukedag og type innhold henger sammen; bruk filteret for å se én
              type innhold. Celler med få innlegg kan skyldes enkeltinnlegg, og kanalen kan ha vokst over tid.
              {h.format === "FEED" && " Feed består nesten bare av CTF, som ikke er aktiv lenger."}
            </p>
          </div>
        </section>
      ))}
      <details className="card help">
        <summary>Hva heatmapet kan og ikke kan si</summary>
        <ul>
          <li>Det viser hvor dere har publisert, og hvordan de innleggene gjorde det mot vanlig for sin type innhold. Det viser ikke hva som ville skjedd på et annet tidspunkt.</li>
          <li>Nesten alle videoer er lagt ut mellom 16 og 24, på faste dager per type innhold. Formiddag, fredag og lørdag er i praksis tomme, så heatmapet kan ikke si noe om dem.</li>
          <li>{bruddTekst()}</li>
          <li>{BANK} VM-innhold og innlegg yngre enn 7 dager er utelatt.</li>
        </ul>
      </details>
    </>
  );
}
