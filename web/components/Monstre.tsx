import { Forelopig } from "@/components/InfoIkon";
import { BRUK_MIN_POSTS, FORELOPIG_GRENSE, TIDSTREND_DAGER } from "@/lib/analyse/analyse";
import { LABEL_NAME, list, type MonsterCard, type MonsterSection } from "@/lib/analyse/monstre";
import type { Result } from "@/lib/data/types";

function Kort({ card }: { card: MonsterCard }) {
  const d = card.details;
  return (
    <article className="card monster" aria-labelledby={`m-${card.id}`}>
      <span className={`monster-label ${card.label}`}>{LABEL_NAME[card.label]}</span>
      <h3 id={`m-${card.id}`}>{card.advice}</h3>
      <p className="monster-num">{card.numbers}</p>
      <details className="monster-more">
        <summary>Vis detaljer</summary>
        <ul className="monster-concepts">
          {d.concepts.map((c) => (
            <li key={c.name}>
              <span className="monster-cname">
                {c.name} {c.preliminary && <Forelopig />}
              </span>
              <span className="monster-cline">{c.line}</span>
              {c.tidstrend && <span className="monster-trend">{c.tidstrend}</span>}
            </li>
          ))}
        </ul>
        {d.basis && <p>{d.basis}</p>}
        {d.suggestion && <p>{d.suggestion}</p>}
        {d.why.length > 0 && <p className="muted">Bare «Prøv» fordi {d.why.join("; ")}.</p>}
        {d.note && <p className="muted">{d.note}</p>}
      </details>
    </article>
  );
}

function Seksjon({ section }: { section: MonsterSection }) {
  return (
    <section className="block" aria-labelledby={`m-${section.id}`}>
      <div className="block-head">
        <h2 id={`m-${section.id}`}>{section.name}</h2>
      </div>
      {section.cards.length ? (
        <div className="card-grid monster-grid">
          {section.cards.map((c) => (
            <Kort key={c.id} card={c} />
          ))}
        </div>
      ) : (
        <p className="muted small">Ingen mønstre ennå.</p>
      )}
    </section>
  );
}

function SlikLeser({ sections }: { sections: MonsterSection[] }) {
  const preliminary = [...new Set(sections.flatMap((s) => s.preliminary))];
  return (
    <details className="card monster-help">
      <summary>Slik leser du tallene</summary>
      <ul>
        <li>
          «1,30 ganger vanlig» betyr at innleggene fikk 30 % flere visninger enn det som er vanlig for samme type innhold
          (f.eks. Folka Først) på samme plattform. Typen innhold holdes dermed lik, så det er tidspunkt, lengde o.l. som
          sammenlignes.
        </li>
        <li>
          <strong>Sikkert</strong>: minst {BRUK_MIN_POSTS} innlegg, og minst to typer innhold viser det samme, uten at noen
          viser det motsatte. <strong>Svakt</strong>: som Sikkert, men under 1,20 ganger vanlig. <strong>Prøv</strong>: lovende,
          men for lite grunnlag.
        </li>
        <li>Visningstallene er levetidstall, så eldre innlegg har hatt mer tid til å samle visninger.</li>
        <li>
          VM og andre spesielle hendelser, og innlegg yngre enn 7 dager, er utelatt. Bankinfo, Før konsepter, Ukjent og
          Annet/aktualitet er ikke med.
        </li>
        <li>
          {preliminary.length ? `${list(preliminary)} har` : "Typer innhold med"} under {FORELOPIG_GRENSE} innlegg og er
          foreløpig: kan bare gi «Prøv».
        </li>
        <li>
          Tidspunkt: kanalen kan ha vokst over tid. Er et tidsrom bare brukt i en del av perioden (mer enn {TIDSTREND_DAGER}{" "}
          dager fra start eller slutt), er det merket «mulig tidstrend» og teller ikke med.
        </li>
        <li>Plattformene og formatene sammenlignes aldri med hverandre.</li>
        {sections.map((s) => (
          <li key={s.id}>
            {s.name}: {s.basis}
          </li>
        ))}
      </ul>
    </details>
  );
}

export function Monstre({ result }: { result: Result<MonsterSection[]> }) {
  if (!result.ok) return <p className="muted">{result.error}</p>;
  return (
    <>
      <p className="monster-intro">
        Mønstre i egne tall, ikke bevis. 1,0 = vanlig visningstall for samme type innhold.
        <br />
        Første versjon. Vi bygger videre og legger til mer.
      </p>
      {result.data.length ? (
        result.data.map((s) => <Seksjon key={s.id} section={s} />)
      ) : (
        <p className="muted">Ingen mønstre ennå.</p>
      )}
      <SlikLeser sections={result.data} />
    </>
  );
}
