// Tekstene i info-ikonene, samlet ett sted. Korte, og uten sammenligning på tvers av plattformer.

import { INACTIVE_AFTER_DAYS } from "./oversikt/konsepter";

export const KILDER = {
  aktivitet:
    "Aktivitet på hele kontoen per døgn, også på eldre innlegg. Døgnene følger Stillehavstid (plattformenes egne døgn), så en uke er mandag–søndag i Stillehavstid. Annonsevisninger (AD) er holdt utenfor; tallene er organiske. YouTube ligger 2–3 døgn bak. Prosent vises når forrige verdi er minst 1 000. En uferdig periode sammenlignes med like mange dager i forrige periode.",
  total:
    "Summen av visninger per innlegg publisert siden start (takeover-datoen), med siste måling for hvert innlegg. Det er visninger, ikke unike personer. Annonsevisninger er holdt utenfor. Tallet vokser også når eldre innlegg får nye visninger. Instagram Feed er alltid med, uansett Feed-bryteren. TikTok er ikke med før API-tilgangen er godkjent. Plattformene teller visninger ulikt og sammenlignes ikke med hverandre.",
  totalInstagram:
    "Instagram (Reels og Feed): visninger per innlegg fra Meta, siste måling, summert for innlegg publisert siden start. Annonsevisninger er holdt utenfor, så Metas egne tall i Instagram Innsikt kan være ca. 1 % høyere. Delinger summeres bare for innlegg der tallet finnes. Kurven viser summen per publiseringsuke med dagens tall.",
  totalYoutube:
    "YouTube (Shorts): visninger, likes og kommentarer fra YouTube Data API per video, siste måling, summert for videoer publisert siden start. Delinger kommer fra YouTube Analytics og summeres bare for videoer der tallet finnes; nye videoer mangler det de første dagene. Kurven viser summen per publiseringsuke med dagens tall.",
  instagramKort:
    "Visninger på hele Instagram-kontoen per døgn (Stillehavstid), også på eldre innlegg. Annonsevisninger (AD) er holdt utenfor, så Metas egne tall i Instagram Innsikt kan være ca. 1 % høyere fordi de inkluderer annonsevisninger.",
  utvikling:
    "Hele kontoen per døgn, også eldre innlegg. Døgnene følger Stillehavstid. Grafen er uavhengig av Uke/Måned-velgeren: intervallet slutter alltid på siste døgn med data (YouTube ligger 2–3 døgn bak). Forrige periode er like mange dager rett før. Annonsevisninger (AD) er holdt utenfor.",
  utviklingVisninger:
    "Visninger per døgn. Etikettene ved de største toppene er en mulig årsak, ikke en fasit: innlegget med flest visninger publisert inntil 3 dager før toppen, på samme plattform og format.",
  interaksjoner:
    "Interaksjoner = likes + kommentarer + delinger, pluss lagringer for Instagram. Dette er ikke Metas total_interactions (som også teller f.eks. svar). Annonsevisninger (AD) er holdt utenfor.",
  anbefalinger:
    "Regelbaserte signaler per plattform og format, aldri på tvers. Gjelder nå, uavhengig av valgt periode. Bare aktive konsepter (innlegg de siste 21 dagene) med minst 6 innlegg som er minst 7 dager gamle; Bankinfo, Før konsepter, Ukjent og Annet/aktualitet er utelatt. Reglene i prioritert rekkefølge: svak trend (de tre siste under ⅔ av konseptets median), ferskt toppinnlegg (7–14 dager gammelt med minst 1,5 × konseptets median), og hvilket konsept som leder på visninger og engasjement (minst 10 % foran nummer to). Nye konsepter med for lite grunnlag rangeres ikke. Signalene er utgangspunkt for vurdering, ikke fasit.",
  ferske:
    "Innlegg publisert de siste 7 dagene. Tallene vokser fortsatt, så de er et tidlig signal og ikke endelige. De brukes ikke i sammenligningene av konsepter, som bare tar med innlegg som er minst 7 dager gamle. Sortert på dato, ikke på visninger.",
  sist: "Innlegg publisert for 7–14 dager siden. Det med flest visninger vises per plattform og format.",
  ganger:
    "Innleggets visninger delt på konseptets median på samme plattform og format. Over ×1,0 betyr bedre enn vanlig.",
  konsepter:
    "Median av innlegg som er minst 7 dager gamle, per plattform og format. Sammenlign bare innenfor samme blokk.",
  engasjement: "(Likes + kommentarer) / visninger per innlegg, median. Sammenlign bare innenfor samme plattform og format.",
  inaktiv: `Inaktiv: ingen innlegg de siste ${INACTIVE_AFTER_DAYS} dagene. Blir aktiv igjen ved neste innlegg.`,
  hendelser: "Innhold knyttet til en spesiell hendelse (f.eks. VM 2026) holdes utenfor konseptene, så det ikke trekker opp medianen.",
} as const;
