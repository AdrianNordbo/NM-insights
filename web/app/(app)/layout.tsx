import { redirect } from "next/navigation";
import { Faner } from "@/components/Faner";
import { TemaKnapp } from "@/components/TemaKnapp";
import { getUser } from "@/lib/auth";
import { KUNDE } from "@/lib/navn";

/**
 * Felles layout for alle dashboard-sider. Innloggingskravet ligger her, i tillegg til proxy.ts:
 * brukeren verifiseres mot Supabase Auth før noe innhold vises.
 * Headeren er starten på det mørke toppfeltet; hver side fortsetter det med <Toppfelt>.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user) redirect("/logg-inn");

  return (
    <>
      <header className="band-head">
        <div className="wrap topline">
          <span className="brand">
            NM Insights <span>· for {KUNDE}</span>
          </span>
          <Faner />
          <span className="topbar-right">
            <span className="user">{user.email}</span>
            <form action="/auth/logg-ut" method="post">
              <button type="submit" className="link-button">
                Logg ut
              </button>
            </form>
            <TemaKnapp />
          </span>
        </div>
      </header>
      {children}
    </>
  );
}
