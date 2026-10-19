import { redirect } from "next/navigation";

/** Mønstrene ligger nå under Publiseringstid. */
export default async function Monstre(props: PageProps<"/monstre">) {
  const params = await props.searchParams;
  const plattform = typeof params.plattform === "string" ? `&plattform=${encodeURIComponent(params.plattform)}` : "";
  redirect(`/publiseringstid?visning=monstre${plattform}`);
}
