"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Oversikt" },
  { href: "/trender", label: "Trender og idéer" },
] as const;

export function Faner() {
  const pathname = usePathname();
  return (
    <nav className="tabs" aria-label="Hovedmeny">
      {TABS.map((tab) => (
        <Link key={tab.href} href={tab.href} aria-current={pathname === tab.href ? "page" : undefined}>
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
