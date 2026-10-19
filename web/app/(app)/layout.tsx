import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Mobilmeny, Sidemeny } from "@/components/dashboard/Sidemeny";
import { getUser } from "@/lib/auth";
import { KUNDE } from "@/lib/navn";

/**
 * Felles layout for alle dashboard-sider: sidemeny (mobil: topplinje med faner) og innhold.
 * Innloggingskravet ligger her, i tillegg til proxy.ts: brukeren verifiseres mot Supabase Auth før noe
 * innhold vises.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user) redirect("/logg-inn");

  return (
    <div className="app">
      <Suspense>
        <Sidemeny kunde={KUNDE} email={user.email ?? null} />
        <Mobilmeny kunde={KUNDE} />
      </Suspense>
      <main className="main">{children}</main>
    </div>
  );
}
