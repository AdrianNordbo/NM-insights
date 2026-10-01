import Link from "next/link";
import { InfoIkon } from "@/components/InfoIkon";
import { KILDER } from "@/lib/kilder";
import type { Navigation } from "@/lib/oversikt/adresse";

/** Resten av det mørke toppfeltet (fortsetter headeren fra layouten), med avrundet nedre kant. */
export function Toppfelt({ title, controls, children }: { title: string; controls?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <section className="band">
      <div className="wrap">
        <div className="band-controls">
          <h1>{title}</h1>
          {controls}
        </div>
        {children}
      </div>
    </section>
  );
}

/** Uke/Måned, pilene og Feed-bryteren. Vanlige lenker: virker uten JavaScript og lagres i adressen. */
export function Periodevelger({
  nav,
  type,
  label,
  feed,
}: {
  nav: Navigation;
  type: "uke" | "måned";
  label: string;
  feed: boolean;
}) {
  return (
    <div className="control-row">
      <nav className="seg" aria-label="Periodetype">
        <Link href={nav.week} aria-current={type === "uke" ? "true" : undefined} scroll={false}>
          Uke
        </Link>
        <Link href={nav.month} aria-current={type === "måned" ? "true" : undefined} scroll={false}>
          Måned
        </Link>
      </nav>
      <div className="stepper">
        {nav.prev ? (
          <Link href={nav.prev} aria-label="Forrige periode" scroll={false}>‹</Link>
        ) : (
          <span aria-hidden="true" className="disabled">‹</span>
        )}
        <span className="stepper-label">{label}</span>
        {nav.next ? (
          <Link href={nav.next} aria-label="Neste periode" scroll={false}>›</Link>
        ) : (
          <span aria-hidden="true" className="disabled">›</span>
        )}
      </div>
      <Link href={nav.feedToggle} className="feed-toggle" role="switch" aria-checked={feed} scroll={false}>
        <span className={feed ? "switch on" : "switch"} aria-hidden="true" />
        Ta med Instagram Feed (bilder og karuseller)
      </Link>
      <InfoIkon id="tall" text={KILDER.aktivitet} />
    </div>
  );
}
