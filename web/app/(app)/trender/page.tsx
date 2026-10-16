import type { Metadata } from "next";
import { Tips } from "@/components/Tips";
import { Toppfelt } from "@/components/oversikt/Toppfelt";
import { buildTips } from "@/lib/analyse/tips";
import { getPostFeatures } from "@/lib/data/dashboard";

export const metadata: Metadata = { title: "Trender og idéer – NM Insights" };

export default async function Trender() {
  const features = await getPostFeatures();
  const result = features.ok ? { ok: true as const, data: buildTips(features.data) } : features;
  return (
    <>
      <Toppfelt title="Trender og idéer" />
      <main className="page">
        <Tips result={result} />
      </main>
    </>
  );
}
