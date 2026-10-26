"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { feilmeldingDrive, sjekkDriveRader } from "@/lib/plan/innboks";
import { isoUke, sammeUke } from "@/lib/plan/uke";
import { gyldigStatus, kanFlytte, type NyRad } from "@/lib/plan/ukeplan";
import { PLAN_PLATTFORMER } from "@/lib/regler/plattformer";
import { createClient } from "@/lib/supabase/server";

// Skriving i den delte kalenderen. Funksjonene i schema planlegging sjekker at brukeren er redaktør; her
// sjekkes formatet i tillegg, så feil gir en rolig melding i stedet for en databasefeil.

export type Svar = { ok: true } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FEIL = "Klarte ikke å lagre. Prøv igjen, eller sjekk at du er redaktør.";

async function rpc(fn: string, args: Record<string, unknown>, feilmelding?: (code: string, message: string) => string): Promise<Svar> {
  try {
    const { error } = await (await createClient()).schema("planlegging").rpc(fn, args);
    if (error) {
      console.error(`planlegging.${fn} feilet:`, JSON.stringify({ code: error.code, message: error.message }));
      if (feilmelding) return { ok: false, error: feilmelding(error.code, error.message) };
      return { ok: false, error: error.message.includes("redaktør") ? "Bare redaktører kan endre kalenderen." : FEIL };
    }
    revalidatePath("/publiseringstid");
    return { ok: true };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, error: FEIL };
  }
}

export async function leggTilVideo(rader: NyRad[]): Promise<Svar> {
  const ok =
    rader.length >= 1 &&
    rader.length <= 10 &&
    rader.every(
      (r) =>
        UUID.test(r.videoId) &&
        r.tittel.trim().length > 0 &&
        r.tittel.length <= 200 &&
        PLAN_PLATTFORMER.some((p) => p.key === r.plattform) &&
        (r.dato === null || sammeUke(isoUke(r.dato), r)),
    );
  if (!ok) return { ok: false, error: "Ugyldig plassering." };
  return rpc("legg_til", {
    p_rader: rader.map((r) => ({
      video_id: r.videoId,
      aar: r.aar,
      uke: r.uke,
      tittel: r.tittel.trim(),
      konsept: r.konsept,
      plattform: r.plattform,
      planlagt_dato: r.dato ?? "",
      klokkeslett: r.klokkeslett ?? "",
      merking: r.merking ?? "",
      grunnlag: r.grunnlag,
    })),
  });
}

/** Legger inn én video fra Drive-innboksen. Databasen avviser dubletter, feil uke og videoer som ikke er tolket ok. */
export async function leggTilFraDrive(driveFileId: string, rader: NyRad[]): Promise<Svar> {
  const feil = sjekkDriveRader(driveFileId, rader);
  if (feil) return { ok: false, error: feil };
  return rpc(
    "legg_til_fra_drive",
    {
      p_drive_file_id: driveFileId,
      p_rader: rader.map((r) => ({
        video_id: r.videoId,
        aar: r.aar,
        uke: r.uke,
        tittel: r.tittel.trim(),
        konsept: r.konsept,
        plattform: r.plattform,
        planlagt_dato: r.dato ?? "",
        klokkeslett: r.klokkeslett ?? "",
        merking: r.merking ?? "",
        grunnlag: r.grunnlag,
      })),
    },
    feilmeldingDrive,
  );
}

export async function flyttPlassering(id: string, aar: number, uke: number, dato: string, klokkeslett: string): Promise<Svar> {
  if (!UUID.test(id)) return { ok: false, error: "Ugyldig plassering." };
  const feil = kanFlytte({ aar, uke }, dato, klokkeslett);
  if (feil) return { ok: false, error: feil };
  return rpc("flytt", { p_id: id, p_dato: dato, p_klokkeslett: klokkeslett });
}

export async function settStatus(id: string, status: string): Promise<Svar> {
  if (!UUID.test(id) || !gyldigStatus(status)) return { ok: false, error: "Ugyldig status." };
  return rpc("sett_status", { p_id: id, p_status: status });
}

export async function fjernVideo(videoId: string): Promise<Svar> {
  if (!UUID.test(videoId)) return { ok: false, error: "Ugyldig video." };
  return rpc("fjern_video", { p_video_id: videoId });
}
