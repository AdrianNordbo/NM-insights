"use client";

import { useActionState } from "react";
import { fullforKobling, type KoblingResultat } from "./actions";

const jaNei = (v: boolean | null) => (v === null ? "ukjent" : v ? "ja" : "nei");

/** Knappen som fullfører koblingen, og resultatet etterpå. */
export function KobleSkjema({ code, state }: { code: string; state: string }) {
  const [result, action, pending] = useActionState<KoblingResultat, FormData>(fullforKobling, null);

  if (result?.ok) {
    return (
      <>
        <h1>TikTok er koblet til</h1>
        <p>
          Konto: <strong>{result.username ? `@${result.username}` : "brukernavn ikke hentet"}</strong>
        </p>
        <p className="muted">
          Business-konto: {jaNei(result.isBusinessAccount)} · Advanced Access: {jaNei(result.hasAdvancedAccess)}
        </p>
        <p className="muted">Tilganger gitt: {result.scopes.join(", ") || "ingen"}</p>
        {result.missing.length > 0 && (
          <p className="error" role="alert">
            Mangler: {result.missing.join(", ")}. Lag en ny lenke og godkjenn alle tilgangene.
          </p>
        )}
      </>
    );
  }

  return (
    <>
      <h1>Koble TikTok</h1>
      <p className="muted">Trykk på knappen for å fullføre koblingen. Lenken kan brukes én gang.</p>
      {result && !result.ok && (
        <p className="error" role="alert">
          {result.message}
        </p>
      )}
      {!result && (
        <form action={action} className="auth-form">
          <input type="hidden" name="code" value={code} />
          <input type="hidden" name="state" value={state} />
          <button type="submit" disabled={pending}>
            {pending ? "Kobler til …" : "Fullfør koblingen"}
          </button>
        </form>
      )}
    </>
  );
}
