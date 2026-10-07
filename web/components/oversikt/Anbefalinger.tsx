import { InfoIkon } from "@/components/InfoIkon";
import { KILDER } from "@/lib/kilder";
import type { RecommendationLine } from "@/lib/oversikt/anbefalinger";

/**
 * «Anbefalinger · gjelder nå». Uke/Måned: i toppfeltet, rett over plattformkortene. Total: eget kort på den
 * lyse bakgrunnen, rett etter kortene. Én linje per plattform og format.
 * Gjelder nå, ikke valgt periode; derfor egen ramme, adskilt fra sammendragssetningene.
 */
export function Anbefalinger({ line, light = false }: { line: RecommendationLine; light?: boolean }) {
  const anyPromising = line.blocks.some((b) => b.promising);
  // light: eget kort på den lyse bakgrunnen (brukes i Total), ellers i det mørke toppfeltet.
  return (
    <section className={light ? "recs recs-light" : "recs"} aria-labelledby="anbefalinger">
      <h2 id="anbefalinger" className="recs-title">
        Anbefalinger <span>· gjelder nå</span> <InfoIkon id="anbefalinger" text={KILDER.anbefalinger} />
      </h2>
      {line.empty && !anyPromising ? (
        <p className="recs-empty">Ingen tydelige signaler akkurat nå.</p>
      ) : (
        <ul className="recs-list">
          {line.blocks.map((b) => (
            <li key={b.id} className={`rec ${b.platform}`}>
              <span className="rec-plat">{b.name}</span>
              <span className="rec-body">
                {b.recommendation ? (
                  <span className="rec-text">
                    {b.recommendation.text}{" "}
                    <InfoIkon id={`rec-${b.id}`} text={b.recommendation.details} />
                  </span>
                ) : (
                  <span className="rec-text rec-none">Ingen tydelige signaler.</span>
                )}
                {b.promising && (
                  <span className="rec-promising">
                    {b.promising.text} <InfoIkon id={`rec-ny-${b.id}`} text={b.promising.details} />
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
