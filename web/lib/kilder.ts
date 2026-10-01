// Tekstene i info-ikonene, samlet ett sted. Korte, og uten sammenligning på tvers av plattformer.

export const KILDER = {
  aktivitet:
    "Aktivitet på hele kontoen per døgn, også på eldre innlegg. Døgnene følger Stillehavstid (plattformenes egne døgn), så en uke er mandag–søndag i Stillehavstid. Annonsevisninger (AD) er holdt utenfor; tallene er organiske. YouTube ligger 2–3 døgn bak. Prosent vises når forrige verdi er minst 1 000. En uferdig periode sammenlignes med like mange dager i forrige periode.",
  utvikling:
    "Hele kontoen per døgn, også eldre innlegg. Døgnene følger Stillehavstid. Grafen er uavhengig av Uke/Måned-velgeren: intervallet slutter alltid på siste døgn med data (YouTube ligger 2–3 døgn bak). Forrige periode er like mange dager rett før. Annonsevisninger (AD) er holdt utenfor.",
  utviklingVisninger:
    "Visninger per døgn. Etikettene ved de største toppene er en mulig årsak, ikke en fasit: innlegget med flest visninger publisert inntil 3 dager før toppen, på samme plattform og format.",
  interaksjoner:
    "Interaksjoner = likes + kommentarer + delinger, pluss lagringer for Instagram. Dette er ikke Metas total_interactions (som også teller f.eks. svar). Annonsevisninger (AD) er holdt utenfor.",
  ferske:
    "Innlegg publisert de siste 7 dagene. Tallene vokser fortsatt, så de er et tidlig signal og ikke endelige. De brukes ikke i sammenligningene av konsepter, som bare tar med innlegg som er minst 7 dager gamle. Sortert på dato, ikke på visninger.",
  sist: "Innlegg publisert for 7–14 dager siden. Det med flest visninger vises per plattform og format.",
  ganger:
    "Innleggets visninger delt på konseptets median på samme plattform og format. Over ×1,0 betyr bedre enn vanlig.",
  konsepter:
    "Median av innlegg som er minst 7 dager gamle, per plattform og format. Sammenlign bare innenfor samme blokk.",
  engasjement: "(Likes + kommentarer) / visninger per innlegg, median. Sammenlign bare innenfor samme plattform og format.",
  avsluttet: "Ingen innlegg de siste 30 dagene.",
  hendelser: "Innhold knyttet til en spesiell hendelse (f.eks. VM 2026) holdes utenfor konseptene, så det ikke trekker opp medianen.",
} as const;
