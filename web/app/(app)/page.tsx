import { checkRawAccessBlocked } from "@/lib/data/access-check";
import { countRows, getContentLatest } from "@/lib/data/dashboard";
import type { ContentLatestRow, DashboardView } from "@/lib/data/types";

// MIDLERTIDIG forside (steg 4): viser at datatilgangen virker som innlogget bruker.
// Erstattes av den ekte forsiden i neste steg.

const VIEWS: DashboardView[] = ["content_latest", "concept_summary", "platform_summary"];
const nb = new Intl.NumberFormat("nb-NO");

function countByPlatformAndFormat(rows: ContentLatestRow[]) {
  const counts = new Map<string, { platform: string; format: string; rows: number; mature: number }>();
  for (const row of rows) {
    const key = `${row.platform}|${row.format}`;
    const entry = counts.get(key) ?? { platform: row.platform, format: row.format, rows: 0, mature: 0 };
    entry.rows += 1;
    if (row.is_mature) entry.mature += 1;
    counts.set(key, entry);
  }
  return [...counts.values()].sort((a, b) => `${a.platform}${a.format}`.localeCompare(`${b.platform}${b.format}`));
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="notice" role="status">
      {children}
    </p>
  );
}

export default async function Home() {
  const [viewCounts, content, rawAccess] = await Promise.all([
    Promise.all(VIEWS.map(async (view) => ({ view, result: await countRows(view) }))),
    getContentLatest(),
    checkRawAccessBlocked(),
  ]);

  return (
    <main className="page">
      <h1>Datatilgang (midlertidig)</h1>
      <p className="muted">
        Tallene er lest fra schema <code>dashboard</code> som innlogget bruker. Siden erstattes av dashboardet i
        neste steg.
      </p>

      <h2>Rader per view</h2>
      <table className="data-table">
        <thead>
          <tr>
            <th>View</th>
            <th className="num">Rader</th>
          </tr>
        </thead>
        <tbody>
          {viewCounts.map(({ view, result }) => (
            <tr key={view}>
              <td>
                <code>{view}</code>
              </td>
              <td className="num">{result.ok ? nb.format(result.data) : <span className="error">{result.error}</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>content_latest per plattform og format</h2>
      {content.ok ? (
        <table className="data-table">
          <thead>
            <tr>
              <th>Plattform</th>
              <th>Format</th>
              <th className="num">Innlegg</th>
              <th className="num">Modne (≥ 7 dager)</th>
            </tr>
          </thead>
          <tbody>
            {countByPlatformAndFormat(content.data).map((row) => (
              <tr key={`${row.platform}|${row.format}`}>
                <td>{row.platform === "instagram" ? "Instagram" : "YouTube"}</td>
                <td>{row.format}</td>
                <td className="num">{nb.format(row.rows)}</td>
                <td className="num">{nb.format(row.mature)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <Notice>{content.error}</Notice>
      )}

      <h2>Sjekk: rådata er stengt</h2>
      {rawAccess.blocked === true && (
        <Notice>
          ✅ Lesing av <code>public.posts</code> som innlogget bruker ble avvist ({rawAccess.code}, permission denied),
          som forventet.
        </Notice>
      )}
      {rawAccess.blocked === false && (
        <p className="error" role="alert">
          ⚠️ Innlogget bruker kunne lese <code>public.posts</code> ({nb.format(rawAccess.rows)} rader). Dette skal
          ikke være mulig. Sjekk rettighetene i Supabase.
        </p>
      )}
      {rawAccess.blocked === null && (
        <Notice>
          Sjekken kunne ikke fullføres, så det er uklart om rådata er stengt. Detaljer: {rawAccess.error}
        </Notice>
      )}
    </main>
  );
}
