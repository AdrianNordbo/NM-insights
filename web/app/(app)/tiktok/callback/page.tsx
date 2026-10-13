import type { Metadata } from "next";
import { readCallbackParams } from "@/lib/tiktok/oauth";
import { KobleSkjema } from "./KobleSkjema";

export const metadata: Metadata = { title: "Koble TikTok – NM Insights", robots: { index: false } };

/**
 * TikTok sender brukeren hit etter godkjenning (registrert som /tiktok/callback/ i portalen; Next fjerner
 * skråstreken og beholder parameterne). Krever innlogging (layouten). GET viser bare en knapp; koden
 * brukes først ved POST, se actions.ts. Lenken lages med tiktok_link.py.
 */
export default async function TikTokCallbackPage(props: PageProps<"/tiktok/callback">) {
  const params = readCallbackParams(await props.searchParams);

  return (
    <main className="auth-card">
      {params.ok ? (
        <KobleSkjema code={params.code} state={params.state} />
      ) : (
        <>
          <h1>Koble TikTok</h1>
          <p className="error" role="alert">
            {params.reason}
          </p>
        </>
      )}
    </main>
  );
}
