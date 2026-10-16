import type { Metadata } from "next";
import { Toppfelt } from "@/components/oversikt/Toppfelt";

export const metadata: Metadata = { title: "Trender og idéer – NM Insights" };

export default function Trender() {
  return (
    <>
      <Toppfelt title="Trender og idéer" />
      <main className="page">
        <section className="recommendations">
          <p className="muted small">Kommer.</p>
        </section>
      </main>
    </>
  );
}
