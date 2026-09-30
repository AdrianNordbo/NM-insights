// Tekstene i info-ikonene, samlet ett sted. Korte, og uten sammenligning på tvers av plattformer.

export const KILDER = {
  oppdatert: "Tallene hentes fra Instagram og YouTube kl. 07 og 20 hver dag.",
  folgere:
    "Siste kjente antall. Nye følgere per uke vises bare når uken har data for alle dager. Instagram lagrer totalen fra 29.09.2026, YouTube fra 30.09.2026.",
  uke: "Siste uke der alle innlegg på plattformen er minst 7 dager gamle, så tallene er sammenlignbare med uken før.",
  visninger: "Visninger fra plattformens API, siste måling. Median av innleggene i uken.",
  sist: "Innlegg publisert for 7–14 dager siden. Det med flest visninger vises per plattform og format.",
  ganger:
    "Innleggets visninger delt på konseptets median på samme plattform og format. Over ×1,0 betyr bedre enn vanlig.",
  konsepter:
    "Median av innlegg som er minst 7 dager gamle, per plattform og format. Sammenlign bare innenfor samme blokk.",
  engasjement: "(Likes + kommentarer) / visninger per innlegg, median. Sammenlign bare innenfor samme plattform og format.",
  forelopig: "Under 6 innlegg. For lite til å trekke konklusjoner.",
  avsluttet: "Ingen innlegg de siste 30 dagene.",
  hendelser: "Innhold knyttet til en spesiell hendelse (f.eks. VM 2026) holdes utenfor konseptene, så det ikke trekker opp medianen.",
} as const;
