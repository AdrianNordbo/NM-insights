import type { Metadata } from "next";
import { InnholdsserierVisning } from "@/components/dashboard/InnholdsserierVisning";
import { getContentLatest, getDailyActivity } from "@/lib/data/dashboard";
import { osloToday } from "@/lib/format";
import { innholdsserierSide } from "@/lib/sider";

export const metadata: Metadata = { title: "Innholdsserier – NM Insights" };

export default async function Innholdsserier(props: PageProps<"/innholdsserier">) {
  const params = await props.searchParams;
  const [daily, content] = await Promise.all([getDailyActivity(), getContentLatest()]);
  if (!content.ok) return <p className="notice">{content.error}</p>;
  const side = innholdsserierSide({ daily: daily.ok ? daily.data : [], content: content.data }, params, osloToday());
  return <InnholdsserierVisning {...side} />;
}
