import type { Metadata } from "next";
import { Monstre } from "@/components/Monstre";
import { Toppfelt } from "@/components/oversikt/Toppfelt";
import { buildMonstre } from "@/lib/analyse/monstre";
import { getPostFeatures } from "@/lib/data/dashboard";

export const metadata: Metadata = { title: "Mønster – NM Insights" };

export default async function MonstreSide() {
  const features = await getPostFeatures();
  const result = features.ok ? { ok: true as const, data: buildMonstre(features.data) } : features;
  return (
    <>
      <Toppfelt title="Mønster" />
      <main className="page">
        <Monstre result={result} />
      </main>
    </>
  );
}
