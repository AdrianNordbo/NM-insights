// Tekstene i info-ikonene, samlet ett sted. Korte, og uten sammenligning på tvers av plattformer.

export const KILDER = {
  aktivitet:
    "Aktivitet på hele kontoen per døgn, også på eldre innlegg. Døgnene følger Stillehavstid (plattformenes egne døgn), så en uke er mandag–søndag i Stillehavstid. Annonsevisninger (AD) er holdt utenfor; tallene er organiske. YouTube ligger 2–3 døgn bak. Prosent vises når forrige verdi er minst 1 000. En uferdig periode sammenlignes med like mange dager i forrige periode.",
  sist: "Innlegg publisert for 7–14 dager siden. Det med flest visninger vises per plattform og format.",
  ganger:
    "Innleggets visninger delt på konseptets median på samme plattform og format. Over ×1,0 betyr bedre enn vanlig.",
  konsepter:
    "Median av innlegg som er minst 7 dager gamle, per plattform og format. Sammenlign bare innenfor samme blokk.",
  engasjement: "(Likes + kommentarer) / visninger per innlegg, median. Sammenlign bare innenfor samme plattform og format.",
  avsluttet: "Ingen innlegg de siste 30 dagene.",
  hendelser: "Innhold knyttet til en spesiell hendelse (f.eks. VM 2026) holdes utenfor konseptene, så det ikke trekker opp medianen.",
} as const;
