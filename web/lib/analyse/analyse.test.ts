import { describe, expect, it } from "vitest";
import { analyse, conceptBaselines, eligible, type FeatureRow, hashtagBand, hourBand, median, rate } from "./analyse";

let id = 0;
function row(p: Partial<FeatureRow>): FeatureRow {
  id += 1;
  return {
    platform: "instagram",
    account_id: 1,
    content_id: `c${id}`,
    format: "REELS",
    special_event: null,
    published_at: "2026-09-01T19:00:00",
    weekday: 1,
    hour: 19,
    hashtag_count: 5,
    hashtags: null,
    text_length: 100,
    duration_s: 30,
    duration_source: "TikTok-versjonen",
    is_mature: true,
    concept: "Sitcom",
    views: 100,
    ...p,
  };
}

/** n innlegg i konseptet med gitte visninger. */
const many = (concept: string, views: number[], p: Partial<FeatureRow> = {}) => views.map((v) => row({ concept, views: v, ...p }));

describe("median", () => {
  it("snitt av de to midterste (percentile_cont)", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([])).toBeNull();
  });
});

describe("eligible", () => {
  it("bare modne, uten spesiell hendelse, ikke utelatte konsepter, riktig format", () => {
    const rows = [
      row({ concept: "Sitcom", views: 100 }),
      row({ concept: "Sitcom", views: 100, is_mature: false }),
      row({ concept: "Sitcom", views: 100, special_event: "VM 2026" }),
      row({ concept: "Bankinfo", views: 100 }),
      row({ concept: "Før konsepter", views: 100 }),
      row({ concept: "Ukjent", views: 100 }),
      row({ concept: "Annet/aktualitet", views: 100 }),
      row({ concept: "Sitcom", views: 100, format: "FEED" }),
      row({ concept: "Sitcom", views: 100, platform: "tiktok", format: "PHOTO" }),
      row({ concept: "Sitcom", views: 100, platform: "tiktok", format: "VIDEO" }),
    ];
    expect(eligible(rows)).toHaveLength(2);
  });
});

describe("VM-innlegg", () => {
  it("et VM-innlegg med ekstreme visninger endrer ingen median eller funn", () => {
    const base = [
      ...many("Folka Først", [100, 200, 300, 400, 500, 600, 700]),
      ...many("Sitcom", [1000, 1100, 1200, 1300, 1400, 1500]),
    ];
    const vm = [
      row({ concept: "Folka Først", views: 5_000_000, special_event: "VM 2026", hour: 22 }),
      row({ concept: "Annet/aktualitet", views: 9_000_000, special_event: "VM 2026", hour: 22 }),
    ];
    expect([...conceptBaselines(eligible([...base, ...vm]))]).toEqual([...conceptBaselines(eligible(base))]);
    expect(analyse([...base, ...vm])).toEqual(analyse(base));
  });
});

describe("rate", () => {
  it("visninger delt på konseptets median på samme plattform og format", () => {
    const rows = [
      ...many("Sitcom", [100, 200, 300]),
      ...many("Sitcom", [1000, 2000, 3000], { platform: "tiktok", format: "VIDEO" }),
    ];
    const r = rate(rows);
    expect(r.filter((x) => x.platform === "instagram").map((x) => x.ratio)).toEqual([0.5, 1, 1.5]);
    expect(r.filter((x) => x.platform === "tiktok").map((x) => x.ratio)).toEqual([0.5, 1, 1.5]);
  });
});

describe("bånd", () => {
  it("tidsrom og hashtags", () => {
    expect([16, 17, 18, 19, 20, 21, 23].map(hourBand)).toEqual([
      "før kl. 17",
      "kl. 17–19",
      "kl. 17–19",
      "kl. 19–21",
      "kl. 19–21",
      "kl. 21 eller senere",
      "kl. 21 eller senere",
    ]);
    expect([4, 5, 6].map(hashtagBand)).toEqual(["under 5 hashtags", "5 hashtags", "over 5 hashtags"]);
  });
});

/** Konsept der innleggene kl. 19 gjør det dobbelt så bra som de kl. 17. */
const eveningWins = (concept: string, n = 4) => [
  ...many(concept, Array(n).fill(100), { hour: 17 }),
  ...many(concept, Array(n).fill(200), { hour: 19 }),
];
const find = (rows: FeatureRow[], level: string) => analyse(rows).find((f) => f.factor === "tidsrom" && f.level === level);

describe("status", () => {
  it("«bruk» når to solide konsepter peker samme vei", () => {
    const f = find([...eveningWins("Folka Først"), ...eveningWins("Sitcom")], "kl. 19–21");
    expect(f?.status).toBe("bruk");
    expect(f?.posts).toBe(8);
    expect(f?.conceptsUp.sort()).toEqual(["Folka Først", "Sitcom"]);
  });

  it("bare «test» når mønsteret finnes i ett konsept", () => {
    const flat = many("Sitcom", [150, 150, 150, 150], { hour: 19 }).concat(many("Sitcom", [150, 150, 150, 150], { hour: 17 }));
    const f = find([...eveningWins("Folka Først", 6), ...flat], "kl. 19–21");
    expect(f?.status).toBe("test");
  });

  it("På Gata (foreløpig) gir aldri «bruk», selv med sterkt mønster", () => {
    // Fem På Gata-innlegg (foreløpig) og ett solid konsept: På Gata teller ikke som andre konsept.
    const rows = [
      ...many("På Gata", [10, 10, 1000, 1000, 1000], { hour: 19 }),
      ...eveningWins("Folka Først", 6),
    ];
    const f = find(rows, "kl. 19–21");
    expect(f?.status).toBe("test");
    // Og alene: aldri «bruk» på noen faktor
    const alone = analyse(many("På Gata", [10, 10, 1000, 1000, 1000], { hour: 19 }));
    expect(alone.some((x) => x.status === "bruk")).toBe(false);
  });

  it("ingen status når medianen er under 1,15", () => {
    const f = find([...eveningWins("Folka Først"), ...eveningWins("Sitcom")], "kl. 17–19");
    expect(f?.status).toBeNull();
  });

  it("et konsept med ett innlegg i nivået teller ikke som samme retning", () => {
    const rows = [...eveningWins("Folka Først", 6), ...many("Sitcom", [100, 100, 100, 100, 100], { hour: 17 }), row({ concept: "Sitcom", views: 500, hour: 19 })];
    const f = find(rows, "kl. 19–21");
    expect(f?.conceptsUp).toEqual(["Folka Først"]);
    expect(f?.status).toBe("test");
  });
});

describe("faktorer", () => {
  it("ukedag bare for Folka Først", () => {
    const rows = [...many("Folka Først", [100, 200, 300], { weekday: 1 }), ...many("Sitcom", [100, 200, 300], { weekday: 2 })];
    const levels = analyse(rows).filter((f) => f.factor === "ukedag");
    expect(levels.map((f) => f.level)).toEqual(["mandag"]);
    expect(levels[0].concepts).toEqual(["Folka Først"]);
  });

  it("varighet i tredeler innenfor konseptet", () => {
    const rows = [
      ...many("Sitcom", [100, 100, 100], { duration_s: 10 }),
      ...many("Sitcom", [100, 100, 100], { duration_s: 20 }),
      ...many("Sitcom", [300, 300, 300], { duration_s: 30 }),
      // Folka Først har helt andre lengder, men får egne tredeler
      ...many("Folka Først", [100, 100, 100], { duration_s: 40 }),
      ...many("Folka Først", [100, 100, 100], { duration_s: 50 }),
      ...many("Folka Først", [300, 300, 300], { duration_s: 60 }),
    ];
    const f = analyse(rows).find((x) => x.factor === "varighet" && x.level === "lang video");
    expect(f?.posts).toBe(6);
    expect(f?.status).toBe("bruk");
  });

  it("innlegg uten varighet er ikke med i varighetsfaktoren", () => {
    const rows = many("Sitcom", [100, 200, 300, 400], { duration_s: null });
    expect(analyse(rows).filter((f) => f.factor === "varighet")).toEqual([]);
  });
});
