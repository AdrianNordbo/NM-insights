import { OversiktVisning } from "@/components/dashboard/OversiktVisning";
import { getContentLatest, getDailyActivity, getFollowerPoints, getFollowers, getPostFeatures } from "@/lib/data/dashboard";
import { osloToday } from "@/lib/format";
import { oversiktSide } from "@/lib/sider";

const FEIL = "Klarte ikke å hente tallene akkurat nå. Prøv igjen om litt.";

export default async function OversiktSide(props: PageProps<"/">) {
  const params = await props.searchParams;
  const today = osloToday();
  const [daily, content, followers, points, features] = await Promise.all([
    getDailyActivity(),
    getContentLatest(),
    getFollowers(),
    getFollowerPoints(),
    getPostFeatures(),
  ]);
  const ok = daily.ok && content.ok;
  const side = oversiktSide(
    {
      daily: daily.ok ? daily.data : [],
      content: content.ok ? content.data : [],
      // Følgere og mønstre er valgfrie: uten dem vises resten som vanlig
      followers: followers.ok ? followers.data : null,
      points: points.ok ? points.data : null,
      features: features.ok ? features.data : null,
    },
    params,
    today,
  );
  return <OversiktVisning {...side} error={ok ? null : FEIL} />;
}
