import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * Innlogget bruker, verifisert mot Supabase Auth (ikke bare lest fra cookien).
 * Returnerer null hvis ingen er innlogget. cache() gjør at det bare sjekkes én gang per forespørsel.
 */
export const getUser = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  return error ? null : data.user;
});
