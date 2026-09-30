import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";

/**
 * Felles layout for alle dashboard-sider. Innloggingskravet ligger her, i tillegg til proxy.ts:
 * brukeren verifiseres mot Supabase Auth før noe innhold vises.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user) redirect("/logg-inn");

  return (
    <>
      <header className="topbar">
        <span className="brand">NM Insights</span>
        <span className="topbar-right">
          <span className="muted">{user.email}</span>
          <form action="/auth/logg-ut" method="post">
            <button type="submit" className="link-button">
              Logg ut
            </button>
          </form>
        </span>
      </header>
      {children}
    </>
  );
}
