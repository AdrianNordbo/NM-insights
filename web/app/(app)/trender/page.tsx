import type { Metadata } from "next";

export const metadata: Metadata = { title: "Trender og idéer – NM Insights" };

/** Plassholder. Skjult i menyen til den er klar (skal brukes til en agent som ser på trender i sosiale medier). */
export default function Trender() {
  return (
    <>
      <div className="eyebrow">Veksthuset</div>
      <h1>Trender og idéer</h1>
      <p className="muted small">Kommer.</p>
    </>
  );
}
