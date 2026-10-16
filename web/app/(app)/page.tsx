import { Oversikt } from "@/components/Oversikt";
import {
  getConceptSummary,
  getContentLatest,
  getDailyActivity,
  getFollowerPoints,
  getFollowers,
  getPlatformSummary,
  getPostFeatures,
} from "@/lib/data/dashboard";
import { buildFungert, buildMonstre } from "@/lib/analyse/monstre";
import type { Result } from "@/lib/data/types";
import { addDays, osloToday, pacificToday, utcToday } from "@/lib/format";
import { buildTopp, type OversiktTopp } from "@/lib/oversikt/side";

export default async function OversiktSide(props: PageProps<"/">) {
  const params = await props.searchParams;
  const now = new Date();
  const today = osloToday(now); // inneværende periode følger Oslo-kalenderen
  // Siste ferdige døgn per plattformdøgn: Meta og YouTube i Stillehavstid, TikTok i UTC
  const expectedThrough = {
    "America/Los_Angeles": addDays(pacificToday(now), -1),
    UTC: addDays(utcToday(now), -1),
  };
  const [daily, platformRows, content, concepts, followers, followerPoints, features] = await Promise.all([
    getDailyActivity(),
    getPlatformSummary(),
    getContentLatest(),
    getConceptSummary(),
    getFollowers(),
    getFollowerPoints(),
    getPostFeatures(),
  ]);
  // Følgerviewene er valgfrie: uten dashboard.followers vises kortene som før; uten follower_points brukes
  // bare de målte totalene.
  const followerRows = followers.ok ? followers.data : null;
  const pointRows = followerPoints.ok ? followerPoints.data : null;

  const failed = [daily, platformRows, content].find((r) => !r.ok);
  const topp: Result<OversiktTopp> =
    failed && !failed.ok
      ? failed
      : daily.ok && platformRows.ok && content.ok
        ? { ok: true, data: buildTopp(daily.data, platformRows.data, content.data, params, today, expectedThrough, followerRows, pointRows) }
        : { ok: false, error: "Klarte ikke å hente tallene akkurat nå. Prøv igjen om litt." };

  return (
    <Oversikt
      topp={topp}
      content={content}
      concepts={concepts}
      today={today}
      showBeforeConcepts={params.vis === "alle"}
      fungert={features.ok ? buildFungert(buildMonstre(features.data)) : null}
    />
  );
}
