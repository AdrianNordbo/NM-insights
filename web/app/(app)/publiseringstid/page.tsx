import type { Metadata } from "next";
import { PubliseringstidVisning } from "@/components/dashboard/PubliseringstidVisning";
import { erRedaktor, getContentLatest, getDailyActivity, getDriveInnboks, getPlannedPosts, getPostFeatures } from "@/lib/data/dashboard";
import { osloToday } from "@/lib/format";
import { publiseringstidSide } from "@/lib/sider";

export const metadata: Metadata = { title: "Publiseringstid – NM Insights" };

export default async function Publiseringstid(props: PageProps<"/publiseringstid">) {
  const params = await props.searchParams;
  const kalender = params.visning === "kalender";
  const [daily, content, features, planned, editor] = await Promise.all([
    getDailyActivity(),
    getContentLatest(),
    getPostFeatures(),
    // Den delte kalenderen er valgfri: uten viewet (før migreringen) vises nettleserkøen
    kalender ? getPlannedPosts() : null,
    kalender ? erRedaktor() : false,
  ]);
  if (!content.ok) return <p className="notice">{content.error}</p>;
  // Drive-innboksen hentes bare for redaktører (andre får ingen spørring og ingen data). Feil: ingen innboks.
  const innboks = kalender && editor ? await getDriveInnboks() : null;
  const side = publiseringstidSide(
    { daily: daily.ok ? daily.data : [], content: content.data, features: features.ok ? features.data : null },
    params,
    osloToday(),
    { rader: planned?.ok ? planned.data : null, editor, innboks: innboks?.ok ? innboks.data : null },
  );
  return <PubliseringstidVisning {...side} />;
}
