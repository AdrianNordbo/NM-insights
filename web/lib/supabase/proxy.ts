import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseEnv } from "./env";

/** Sider som kan vises uten innlogging. */
const PUBLIC_PATHS = ["/logg-inn", "/auth/confirm"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/**
 * Fornyer sesjonen på hver forespørsel og sender uinnloggede til /logg-inn.
 * Dette er en rask («optimistisk») sjekk. Den egentlige sjekken ligger i server-layouten
 * for dashboardet (app/(app)/layout.tsx), som verifiserer brukeren mot Supabase Auth.
 */
export async function updateSession(request: NextRequest) {
  const { url, key } = supabaseEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([header, value]) => response.headers.set(header, value));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const loggedIn = Boolean(data?.claims);

  if (!loggedIn && !isPublic(request.nextUrl.pathname)) {
    const target = request.nextUrl.clone();
    target.pathname = "/logg-inn";
    target.search = "";
    const redirect = NextResponse.redirect(target);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }

  return response;
}
