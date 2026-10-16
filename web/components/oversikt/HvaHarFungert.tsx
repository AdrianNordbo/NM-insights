import Link from "next/link";
import type { FungertRow } from "@/lib/analyse/monstre";

/** «Hva har fungert»: bare «Sikkert»-mønstre fra /monstre, maks 3 per plattform og format. */
export function HvaHarFungert({ rows }: { rows: FungertRow[] }) {
  const any = rows.some((r) => r.lines.length);
  return (
    <section className="block" aria-labelledby="fungert">
      <div className="block-head">
        <h2 id="fungert">Hva har fungert</h2>
        <p className="block-sub">
          <Link href="/monstre">Se alle mønstre</Link>
        </p>
      </div>
      <div className="card fungert">
        {!any ? (
          <p className="muted small">Ingen sikre mønstre ennå.</p>
        ) : (
          rows.map((r) => (
            <div key={r.id} className="fungert-row">
              <div className="fungert-name">{r.name}</div>
              {r.lines.length ? (
                <ul>
                  {r.lines.map((l) => (
                    <li key={l.advice}>
                      <strong>{l.advice}</strong> <span className="muted">· {l.numbers}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted small">Ingen sikre mønstre ennå.</p>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
