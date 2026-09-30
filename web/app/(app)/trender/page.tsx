import type { Metadata } from "next";

export const metadata: Metadata = { title: "Trender og idéer – NM Insights" };

export default function Trender() {
  return (
    <main className="page">
      <div className="page-head">
        <h1>Trender og idéer</h1>
      </div>
      <section className="recommendations">
        <p className="muted small">Kommer.</p>
      </section>
    </main>
  );
}
