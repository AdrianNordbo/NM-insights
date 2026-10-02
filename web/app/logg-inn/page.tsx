import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { sendLoginLink } from "./actions";

export const metadata: Metadata = { title: "Logg inn – NM Insights" };

const MESSAGES: Record<string, string> = {
  epost: "Skriv inn en gyldig e-postadresse.",
  lenke:
    "Lenken er ugyldig eller utløpt. Be om en ny.",
  grense: "For mange forsøk. Vent litt og prøv igjen.",
};

export default async function LoginPage(props: PageProps<"/logg-inn">) {
  if (await getUser()) redirect("/");
  const params = await props.searchParams;
  const sent = params.sendt === "1";
  const error = typeof params.feil === "string" ? MESSAGES[params.feil] : undefined;

  return (
    <main className="auth-card">
      <h1>Logg inn</h1>
      {sent ? (
        <>
          <p>
            Hvis adressen har tilgang, har vi sendt en innloggingslenke. Sjekk e-posten din. Lenken kan
            brukes én gang og utløper etter en time.
          </p>
          <p className="muted">
            Åpne lenken i denne nettleseren, på samme enhet. Lenken virker ikke hvis den åpnes et annet sted.
          </p>
        </>
      ) : (
        <>
          <p className="muted">Du får en innloggingslenke på e-post. Tilgang gis bare på invitasjon.</p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <form action={sendLoginLink} className="auth-form">
            <label htmlFor="email">E-post</label>
            <input id="email" name="email" type="email" autoComplete="email" required />
            <button type="submit">Send innloggingslenke</button>
          </form>
        </>
      )}
    </main>
  );
}
