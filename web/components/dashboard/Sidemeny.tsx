"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { TemaKnapp } from "@/components/TemaKnapp";

/** Sidene i menyen. «Trender og idéer» er skjult til den er klar (siden finnes på /trender). */
const SIDER = [
  {
    href: "/",
    label: "Oversikt",
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
        <rect x="3" y="3" width="6" height="6" rx="1.5" />
        <rect x="11" y="3" width="6" height="6" rx="1.5" />
        <rect x="3" y="11" width="6" height="6" rx="1.5" />
        <rect x="11" y="11" width="6" height="6" rx="1.5" />
      </svg>
    ),
  },
  {
    href: "/innholdsserier",
    label: "Innholdsserier",
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
        <path d="M4 16V9M10 16V4M16 16v-5" />
      </svg>
    ),
  },
  {
    href: "/publiseringstid",
    label: "Publiseringstid",
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
        <circle cx="10" cy="10" r="7" />
        <path d="M10 6v4l3 2" />
      </svg>
    ),
  },
] as const;

/** Lenkene beholder plattformvalget når man bytter side. */
function useHref() {
  const params = useSearchParams();
  const plattform = params.get("plattform");
  return (href: string) => (plattform ? `${href}?plattform=${encodeURIComponent(plattform)}` : href);
}

export function Sidemeny({ kunde, email }: { kunde: string; email: string | null }) {
  const pathname = usePathname();
  const href = useHref();
  return (
    <aside className="side" aria-label="Hovedmeny">
      <div className="brand">
        NM Insights<span>.</span>
      </div>
      <div className="client">{kunde}</div>
      <nav>
        {SIDER.map((s) => (
          <Link key={s.href} className="nav" href={href(s.href)} aria-current={pathname === s.href ? "page" : undefined}>
            {s.icon}
            {s.label}
          </Link>
        ))}
      </nav>
      <div className="side-foot">
        {email && <div>{email}</div>}
        <TemaKnapp />
        <form action="/auth/logg-ut" method="post">
          <button type="submit" className="side-button">
            Logg ut
          </button>
        </form>
      </div>
    </aside>
  );
}

/** Mobil: mørk topplinje med navn og faner. */
export function Mobilmeny({ kunde }: { kunde: string }) {
  const pathname = usePathname();
  const href = useHref();
  return (
    <div className="mtop">
      <div className="row">
        <div className="brand">
          NM Insights<span>.</span>
        </div>
        <span className="client" style={{ margin: 0 }}>
          {kunde}
        </span>
        <TemaKnapp />
      </div>
      <nav className="mtabs" aria-label="Hovedmeny">
        {SIDER.map((s) => (
          <Link key={s.href} className="nav" href={href(s.href)} aria-current={pathname === s.href ? "page" : undefined}>
            {s.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
