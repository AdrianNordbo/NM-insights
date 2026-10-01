import { Oversikt } from "@/components/Oversikt";
import {
  getConceptSummary,
  getContentLatest,
  getDailyActivity,
  getPlatformSummary,
} from "@/lib/data/dashboard";
import type { Result } from "@/lib/data/types";
import { osloToday } from "@/lib/format";
import { buildTopp, type OversiktTopp } from "@/lib/oversikt/side";

export default async function OversiktSide(props: PageProps<"/">) {
  const params = await props.searchParams;
  const today = osloToday();
  const [daily, platformRows, content, concepts] = await Promise.all([
    getDailyActivity(),
    getPlatformSummary(),
    getContentLatest(),
    getConceptSummary(),
  ]);

  const failed = [daily, platformRows, content].find((r) => !r.ok);
  const topp: Result<OversiktTopp> =
    failed && !failed.ok
      ? failed
      : daily.ok && platformRows.ok && content.ok
        ? { ok: true, data: buildTopp(daily.data, platformRows.data, content.data, params, today) }
        : { ok: false, error: "Klarte ikke å hente tallene akkurat nå. Prøv igjen om litt." };

  return (
    <Oversikt
      topp={topp}
      content={content}
      concepts={concepts}
      today={today}
      showBeforeConcepts={params.vis === "alle"}
    />
  );
}
