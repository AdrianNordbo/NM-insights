import { Oversikt } from "@/components/Oversikt";
import { getConceptSummary, getContentLatest, getPlatformSummary } from "@/lib/data/dashboard";
import { osloToday } from "@/lib/format";

export default async function OversiktSide(props: PageProps<"/">) {
  const params = await props.searchParams;
  const [platformRows, content, concepts] = await Promise.all([
    getPlatformSummary(),
    getContentLatest(),
    getConceptSummary(),
  ]);
  return (
    <Oversikt
      platformRows={platformRows}
      content={content}
      concepts={concepts}
      today={osloToday()}
      showBeforeConcepts={params.vis === "alle"}
    />
  );
}
