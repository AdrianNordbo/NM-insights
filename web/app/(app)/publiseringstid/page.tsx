import type { Metadata } from "next";
import { PubliseringstidVisning } from "@/components/dashboard/PubliseringstidVisning";
import { getContentLatest, getDailyActivity, getPostFeatures } from "@/lib/data/dashboard";
import { osloToday } from "@/lib/format";
import { publiseringstidSide } from "@/lib/sider";

export const metadata: Metadata = { title: "Publiseringstid – NM Insights" };

export default async function Publiseringstid(props: PageProps<"/publiseringstid">) {
  const params = await props.searchParams;
  const [daily, content, features] = await Promise.all([getDailyActivity(), getContentLatest(), getPostFeatures()]);
  if (!content.ok) return <p className="notice">{content.error}</p>;
  const side = publiseringstidSide(
    { daily: daily.ok ? daily.data : [], content: content.data, features: features.ok ? features.data : null },
    params,
    osloToday(),
  );
  return <PubliseringstidVisning {...side} />;
}
