import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Mottak for Supabase sin standard e-postmal ({{ .ConfirmationURL }}), som ender med ?code= (PKCE).
 * Koden kan bare veksles inn i samme nettleser som ba om lenken, fordi code_verifier ligger i en
 * cookie der. Brukes til egen SMTP og token_hash-malene er på plass; da tar /auth/confirm over.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const failure = new URL("/logg-inn?feil=lenke", request.url);
  if (!code) return NextResponse.redirect(failure, { status: 303 });

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(failure, { status: 303 });
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
