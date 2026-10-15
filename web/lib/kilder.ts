// Tekstene i info-ikonene, samlet ett sted. Korte, og uten sammenligning på tvers av plattformer.

import { INACTIVE_AFTER_DAYS } from "./oversikt/konsepter";

export const KILDER = {
  aktivitet:
    "Aktivitet på hele kontoen per døgn, også på eldre innlegg. Døgnene følger plattformenes egne døgn: Stillehavstid for Instagram og YouTube, UTC for TikTok, så en uke er mandag–søndag i det døgnet. Annonsevisninger (AD) er holdt utenfor for Instagram; TikTok kan inneholde betalt visning. YouTube ligger 2–3 døgn bak, TikTok 1–2. Prosent vises når forrige verdi er minst 1 000. En uferdig periode sammenlignes med like mange dager i forrige periode.",
  total:
    "Summen av visninger per innlegg publisert siden start (takeover-datoen), med siste måling for hvert innlegg. Det er visninger, ikke unike personer. Annonsevisninger er holdt utenfor for Instagram. Tallet vokser også når eldre innlegg får nye visninger. Instagram Feed er alltid med, uansett Feed-bryteren. TikTok-visningene er levetidstall per innlegg og kan inneholde betalt visning. Metas egne Instagram-tall (Instagram Innsikt) er høyere fordi de også tar med historier, annonser og innlegg publisert før startdatoen. Plattformene teller visninger ulikt og sammenlignes ikke med hverandre.",
  totalInstagram:
    "Instagram (Reels og Feed): visninger per innlegg fra Meta, siste måling, summert for innlegg publisert siden start. Annonsevisninger er holdt utenfor, så Metas egne tall i Instagram Innsikt kan være ca. 1 % høyere. Delinger summeres bare for innlegg der tallet finnes. Kurven viser summen per publiseringsuke med dagens tall.",
  totalYoutube:
    "YouTube (Shorts): visninger, likes og kommentarer fra YouTube Data API per video, siste måling, summert for videoer publisert siden start. Delinger kommer fra YouTube Analytics og summeres bare for videoer der tallet finnes; nye videoer mangler det de første dagene. Kurven viser summen per publiseringsuke med dagens tall.",
  totalTiktok:
    "TikTok: summen av visninger per innlegg (TikToks video_views), publisert siden start. Levetidstall fra siste måling (hele innleggets levetid), ikke unike personer. TikToks døgn er UTC. Kan inneholde betalt visning (TikTok skiller ikke organisk og betalt per innlegg); ingen av Veksthusets innlegg er merket som brukt i annonser. TikTok oppdaterer tallene med 24–48 timers forsinkelse, så de nyeste innleggene er ufullstendige. Delinger inkluderer «Send til venner». Kurven viser summen per publiseringsuke med dagens tall.",
  tiktokKort:
    "Visninger på hele TikTok-kontoen per døgn, også på eldre innlegg. Døgnene er UTC (TikToks egne døgn), ikke Stillehavstid som for Instagram og YouTube. Kan inneholde betalt visning. TikTok ligger 1–2 døgn bak. Nye følgere per døgn gir TikTok bare for Business-kontoer, så kortet viser netto (endring i totalen).",
  folgereInstagram:
    "Netto nye følgere = hvor mange flere følgere kontoen har ved periodens slutt enn dagen før periodestart (nye minus dem som sluttet). Totalen («følgere nå») står i Total. Totalen måles daglig fra 29.09.2026 ved hentingen (siste måling per Oslo-dato, vanligvis kl. 20). Før det finnes bare månedstall (30.06, 31.07, 31.08) og startverdien per 15.06, beregnet fra avleste tall i Meta Insikt (nye minus dem som sluttet); de kan avvike med noen få følgere fra det Meta måler, og uker før 29.09 har derfor ikke nok data. «målt fra dd.mm» betyr at første tall er målt; «fra dd.mm» at det er beregnet. Nye følgere (Meta) er brutto: bare dem som begynte å følge, per Metas døgn i Stillehavstid (et døgn slutter kl. 09 neste morgen norsk tid). Brutto og netto måler derfor ulike ting over litt ulike tidsrom og kan avvike begge veier; brutto vises ikke når netto bare dekker en del av perioden.",
  folgereYoutube:
    "Netto nye abonnenter = hvor mange flere abonnenter kanalen har ved periodens slutt enn dagen før periodestart (nye minus tapte). Totalen («følgere nå») står i Total. Totalen er sanntid fra YouTube, målt ved hentingen (siste måling per Oslo-dato, vanligvis kl. 20). Før 30.09 er totalen per døgn beregnet fra YouTube Analytics (nye minus tapte abonnenter fra kanalen ble opprettet 04.06). Perioder som krysser 30.09 bruker en Analytics-beregnet start og en målt slutt fra YouTube; overgangen er kontrollert (39 abonnenter både 29.09 og 30.09). Nye abonnenter (brutto) kommer fra YouTube Analytics, som ligger 2–3 døgn bak og bruker Stillehavsdøgn; tallet vises først når alle dagene i perioden er ferdige i Analytics.",
  folgereTiktok:
    "Netto nye følgere = hvor mange flere følgere kontoen har ved periodens slutt enn dagen før periodestart (nye minus dem som sluttet). Totalen («følgere nå») står i Total. TikTok gir ikke nye og tapte hver for seg for denne kontotypen, så det er ingen brutto-linje. Døgnene er UTC når TikTok har behandlet dem (1–2 døgn); de siste dagene er målinger fra hentingen. Totalen per døgn er målt fra 14.08.2026 (TikTok gir bare 60 dager bakover). Før det finnes bare månedstall (30.06, 31.07), beregnet fra netto i TikTok Studio, og startverdien 0 (kontoen startet på 0); de kan avvike med noen få følgere fra det TikTok måler, og uker før 14.08 har derfor ikke nok data.",
  folgereTotal:
    "Følgere nå: summen av følgere og abonnenter på kontoene i dag. Det er en sum av kontoer, ikke unike personer: samme person kan følge flere kontoer. Bare totalene summeres; netto står per plattform på kortene og summeres aldri på tvers. «Siden dd.mm» er netto fra startverdien, eller fra første måling når startverdi mangler.",
  instagramKort:
    "Visninger på hele Instagram-kontoen per døgn (Stillehavstid), også på eldre innlegg. Annonsevisninger (AD) er holdt utenfor, så Metas egne tall i Instagram Innsikt kan være ca. 1 % høyere fordi de inkluderer annonsevisninger.",
  utvikling:
    "Hele kontoen per døgn, også eldre innlegg. Døgnene følger Stillehavstid (TikTok: UTC). Grafen er uavhengig av Uke/Måned-velgeren: intervallet slutter alltid på siste døgn med data (YouTube ligger 2–3 døgn bak). Forrige periode er like mange dager rett før. Annonsevisninger (AD) er holdt utenfor.",
  utviklingVisninger:
    "Visninger per døgn. Etikettene ved de største toppene er en mulig årsak, ikke en fasit: innlegget med flest visninger publisert inntil 3 dager før toppen, på samme plattform og format.",
  interaksjoner:
    "Interaksjoner = likes + kommentarer + delinger, pluss lagringer for Instagram. Dette er ikke Metas total_interactions (som også teller f.eks. svar). Annonsevisninger (AD) er holdt utenfor.",
  anbefalinger:
    "Regelbaserte signaler per plattform og format, aldri på tvers. Gjelder nå, uavhengig av valgt periode. Bare aktive konsepter (innlegg de siste 21 dagene) med minst 6 innlegg som er minst 7 dager gamle; Bankinfo, Før konsepter, Ukjent og Annet/aktualitet er utelatt. Reglene i prioritert rekkefølge: svak trend (de tre siste under ⅔ av konseptets median), ferskt toppinnlegg (7–14 dager gammelt med minst 1,5 × konseptets median), og hvilket konsept som leder på visninger og engasjement (minst 10 % foran nummer to). Nye konsepter med for lite grunnlag rangeres ikke. Signalene er utgangspunkt for vurdering, ikke fasit.",
  ferske:
    "Innlegg publisert de siste 7 dagene. Tallene vokser fortsatt, så de er et tidlig signal og ikke endelige. «Venter på TikTok» betyr at TikTok ikke har behandlet tallene ennå (24–48 timer). De brukes ikke i sammenligningene av konsepter, som bare tar med innlegg som er minst 7 dager gamle. Sortert på dato, ikke på visninger.",
  sist: "Innlegg publisert for 7–14 dager siden. Det med flest visninger vises per plattform og format.",
  ganger:
    "Innleggets visninger delt på konseptets median på samme plattform og format. Over ×1,0 betyr bedre enn vanlig.",
  konsepter:
    "Median av innlegg som er minst 7 dager gamle, per plattform og format. Sammenlign bare innenfor samme blokk.",
  engasjement: "(Likes + kommentarer) / visninger per innlegg, median. Sammenlign bare innenfor samme plattform og format.",
  inaktiv: `Inaktiv: ingen innlegg de siste ${INACTIVE_AFTER_DAYS} dagene. Blir aktiv igjen ved neste innlegg.`,
  hendelser: "Innhold knyttet til en spesiell hendelse (f.eks. VM 2026) holdes utenfor konseptene, så det ikke trekker opp medianen.",
} as const;
