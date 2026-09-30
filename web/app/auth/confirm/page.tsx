import type { Metadata } from "next";
import Link from "next/link";
import { confirmLogin } from "./actions";

export const metadata: Metadata = { title: "Logg inn – NM Insights" };

/**
 * Landingsside for lenken i e-posten. Viser bare en knapp; selve innloggingen (verifyOtp) skjer
 * først ved POST når knappen trykkes. E-postskannere (f.eks. Microsoft Safe Links) som åpner
 * lenken automatisk, bruker derfor ikke opp engangskoden.
 */
export default async function ConfirmPage(props: PageProps<"/auth/confirm">) {
  const params = await props.searchParams;
  const tokenHash = typeof params.token_hash === "string" ? params.token_hash : "";
  const type = params.type === "invite" ? "invite" : params.type === "email" ? "email" : "";

  if (!tokenHash || !type) {
    return (
      <main className="auth-card">
        <h1>Ugyldig lenke</h1>
        <p>
          Lenken mangler informasjon. <Link href="/logg-inn">Be om en ny innloggingslenke</Link>.
        </p>
      </main>
    );
  }

  return (
    <main className="auth-card">
      <h1>{type === "invite" ? "Aktiver tilgang" : "Logg inn"}</h1>
      <p className="muted">Trykk på knappen for å fullføre innloggingen.</p>
      <form action={confirmLogin} className="auth-form">
        <input type="hidden" name="token_hash" value={tokenHash} />
        <input type="hidden" name="type" value={type} />
        <button type="submit">{type === "invite" ? "Aktiver tilgang og logg inn" : "Logg inn"}</button>
      </form>
    </main>
  );
}
