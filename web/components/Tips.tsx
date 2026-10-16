import { Forelopig } from "@/components/InfoIkon";
import { BRUK_MIN_POSTS, FORELOPIG_GRENSE, TEST_MIN_POSTS, TIDSTREND_DAGER } from "@/lib/analyse/analyse";
import { list, type TipItem, type TipSection } from "@/lib/analyse/tips";
import type { Result } from "@/lib/data/types";

const TIDSROM_VEKST = "Kan påvirkes av at kanalen har vokst over tid.";

function Forklaring({ preliminary }: { preliminary: string[] }) {
  return (
    <section className="card tips-intro" aria-labelledby="tips-slik">
      <h2 id="tips-slik">Slik leser du tipsene</h2>
      <ul>
        <li>
          <strong>×1,00 = vanlig for konseptet.</strong> Hvert innlegg måles mot medianen for sitt eget konsept på samme
          plattform og format. ×1,30 betyr 30 % flere visninger enn vanlig for konseptet.
        </li>
        <li>
          <strong>Mønster i egne tall, ikke bevis. Konseptet er holdt konstant.</strong>
        </li>
        <li>
          VM og andre spesielle hendelser, og innlegg yngre enn 7 dager, er utelatt. Bankinfo, Før konsepter, Ukjent og
          Annet/aktualitet er ikke med.
        </li>
        <li>
          {preliminary.length ? `${list(preliminary)} har` : "Konsepter med"} under {FORELOPIG_GRENSE} modne innlegg og er
          foreløpig{preliminary.length === 1 ? "" : "e"}: de kan bare gi «Test».
        </li>
        <li>Visninger er levetidstall, så eldre innlegg har hatt mer tid.</li>
        <li>Tidsrom: {TIDSROM_VEKST}</li>
        <li>
          <strong>Bruk</strong>: minst {BRUK_MIN_POSTS} innlegg, minst ×1,15, og minst to konsepter med {FORELOPIG_GRENSE}+
          modne innlegg som peker samme vei (hver minst ×1,05), uten at noe konsept peker motsatt vei.{" "}
          <strong>Test</strong>: lovende (minst ×1,15 på minst {TEST_MIN_POSTS} innlegg), men ikke nok til «Bruk».
        </li>
        <li>
          Mulig tidstrend: konseptet har bare brukt tidsrommet i en del av perioden (mer enn {TIDSTREND_DAGER} dager fra
          start eller slutt), og teller ikke som støtte.
        </li>
        <li>Plattformene og formatene sammenlignes aldri med hverandre.</li>
      </ul>
    </section>
  );
}

function Tidsromsjekk({ item }: { item: TipItem }) {
  if (!item.tidsrom) return null;
  return (
    <details className="tips-fold">
      <summary>Tidsrom-sjekk per konsept</summary>
      <p className="muted small">
        Antall innlegg, første–siste publisering og median per tidsrom. Er tidsrommet bare brukt tidlig eller sent, kan
        funnet være en tidstrend. {TIDSROM_VEKST}
      </p>
      <div className="tips-scroll">
        <table className="tips-table">
          <thead>
            <tr>
              <th scope="col">Tidsrom</th>
              <th scope="col" className="n">
                <abbr title="Innlegg">Innl.</abbr>
              </th>
              <th scope="col">Periode</th>
              <th scope="col" className="n">
                Median
              </th>
            </tr>
          </thead>
          {item.tidsrom.map((c) => (
            <tbody key={c.concept}>
              <tr className="tips-group">
                <th scope="colgroup" colSpan={4}>
                  {c.concept} {c.preliminary && <Forelopig />}
                  {item.tidstrend.includes(c.concept) && <span className="tag tips-trend">mulig tidstrend</span>}
                </th>
              </tr>
              {c.bands.map((b) => (
                <tr key={b.band} className={b.current ? "tips-current" : undefined}>
                  <td>{b.band}</td>
                  <td className="n">{b.posts}</td>
                  <td>{b.period}</td>
                  <td className="n">{b.ratio}</td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </details>
  );
}

function Funn({ item }: { item: TipItem }) {
  return (
    <article className={`card tips-item ${item.status}`} aria-labelledby={`tip-${item.id}`}>
      <div className="tips-kicker">
        <span className={`tips-status ${item.status}`}>{item.status === "bruk" ? "Bruk" : "Test"}</span>
        <span className="muted">{item.factorName}</span>
      </div>
      <h4 id={`tip-${item.id}`}>{item.title}</h4>
      <div className="tips-ratio">
        {item.ratio} <span>av vanlig for konseptet</span>
      </div>
      <p className="tips-meta">
        {item.posts} innlegg · {item.conceptCount} {item.conceptCount === 1 ? "konsept" : "konsepter"}
        {item.support && <> · {item.support}</>}
      </p>
      {item.allLine && <p className="muted small">{item.allLine}</p>}
      {item.hypothesis && (
        <p className="tips-hyp">
          <strong>Hypotese:</strong> {item.hypothesis}
        </p>
      )}
      {item.whyTest.length > 0 && <p className="muted small">Bare test fordi {item.whyTest.join("; ")}.</p>}
      {item.tidstrend.length > 0 && (
        <p className="small">
          <span className="tag tips-trend">mulig tidstrend</span> {list(item.tidstrend)}
        </p>
      )}
      {item.factor === "tidsrom" && <p className="muted small">{TIDSROM_VEKST}</p>}

      <ul className="tips-concepts">
        {item.concepts.map((c) => (
          <li key={c.name}>
            <span className="tips-cname">
              {c.name} {c.preliminary && <Forelopig />}
            </span>
            <span className="tips-cnum">
              {c.ratio} · {c.posts} innl.{c.range && ` · ${c.range}`}
              {c.tidstrend && " · mulig tidstrend"}
            </span>
          </li>
        ))}
      </ul>
      <Tidsromsjekk item={item} />
    </article>
  );
}

function Seksjon({ section }: { section: TipSection }) {
  return (
    <section className="block" aria-labelledby={`tips-${section.id}`}>
      <div className="block-head">
        <h2 id={`tips-${section.id}`}>{section.name}</h2>
        <p className="block-sub">
          {section.basis}: {section.baseline.map((b) => `${b.name} ${b.posts}${b.preliminary ? " (foreløpig)" : ""}`).join(" · ")}
        </p>
      </div>
      <h3 className="tips-h3">Bruk</h3>
      {section.bruk.length ? (
        <div className="card-grid tips-grid">
          {section.bruk.map((i) => (
            <Funn key={i.id} item={i} />
          ))}
        </div>
      ) : (
        <p className="muted small">Ingen mønstre som holder til «Bruk» ennå.</p>
      )}
      <h3 className="tips-h3">Test</h3>
      {section.test.length ? (
        <div className="card-grid tips-grid">
          {section.test.map((i) => (
            <Funn key={i.id} item={i} />
          ))}
        </div>
      ) : (
        <p className="muted small">Ingen lovende mønstre å teste ennå.</p>
      )}
    </section>
  );
}

export function Tips({ result }: { result: Result<TipSection[]> }) {
  if (!result.ok) return <p className="muted">{result.error}</p>;
  const preliminary = [...new Set(result.data.flatMap((s) => s.baseline.filter((b) => b.preliminary).map((b) => b.name)))];
  return (
    <>
      <Forklaring preliminary={preliminary} />
      {result.data.length ? result.data.map((s) => <Seksjon key={s.id} section={s} />) : <p className="muted">Ingen innlegg å analysere ennå.</p>}
    </>
  );
}
