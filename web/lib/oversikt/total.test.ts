import { describe, expect, it } from "vitest";
import { buildSeries } from "./aktivitet";
import { hrefFor, navigation, readState } from "./adresse";
import { buildTopp } from "./side";
import { buildTotal, takeoverDates } from "./total";
import { days, post } from "./testdata";

const TODAY = "2026-10-06";
const TAKEOVER = { instagram: "2026-06-15", youtube: "2026-06-15" } as const;

const content = [
  post("instagram", "REELS", "2026-06-14T23:59:00", 1000), // dagen før start: ikke med
  post("instagram", "REELS", "2026-06-15T00:05:00", 2000), // første døgn (Oslo-tid): med
  post("instagram", "REELS", "2026-07-04T19:00:00", 90000, { special_event: "VM 2026", shares: 50 }),
  post("instagram", "FEED", "2026-08-10T10:00:00", 300, { shares: 2 }),
  post("instagram", "REELS", "2026-10-05T19:00:00", 700, { age_days: 0.5, is_mature: false, shares: 1 }), // ferskt: med
  post("youtube", "SHORTS", "2026-06-20T19:00:00", 500, { shares: 3 }),
  post("youtube", "SHORTS", "2026-10-04T19:00:00", 60, { shares: null }), // mangler delinger
];

describe("Total", () => {
  const total = buildTotal(content, TAKEOVER, TODAY)!;
  const ig = total.platforms.find((p) => p.platform === "instagram")!;
  const yt = total.platforms.find((p) => p.platform === "youtube")!;

  it("datogrensen: innlegg fra og med startdatoen (Oslo-dato) er med, dagen før er ikke", () => {
    expect(ig.posts).toBe(4);
    expect(ig.views).toBe(2000 + 90000 + 300 + 700);
    expect(total.since).toBe("2026-06-15");
    const later = buildTotal(content, { instagram: "2026-06-16", youtube: "2026-06-15" }, TODAY)!;
    expect(later.platforms[0].views).toBe(90000 + 300 + 700);
  });

  it("alle aldre er med, ikke bare modne innlegg", () => {
    expect(ig.views).toBeGreaterThan(92300); // inkluderer innlegget som er en halv dag gammelt
  });

  it("totalen er summen av plattformene, og VM-innhold telles med som alt annet", () => {
    expect(total.views).toBe(ig.views + yt.views);
    expect(ig.views).toBe(2000 + 90000 + 300 + 700); // VM-innlegget på 90 000 er med
    expect(Object.keys(ig)).not.toContain("vmViews");
  });

  it("delinger summeres bare der tallet finnes, og antallet med tall vises", () => {
    expect(yt.shares).toBe(3);
    expect(yt.postsWithShares).toBe(1);
    expect(yt.posts).toBe(2);
    expect(ig.shares).toBe(53); // to Instagram-innlegg uten shares-felt (før migreringen) teller ikke
    expect(ig.postsWithShares).toBe(3);
  });

  it("kurven er kumulativ per uke fra startuken til inneværende uke", () => {
    expect(ig.cumulative[0].label).toBe("Uke 25 · 15.06–21.06");
    expect(ig.cumulative.at(-1)?.label).toBe("Uke 41 · 05.10–11.10");
    expect(ig.cumulative.at(-1)?.value).toBe(ig.views);
    const values = ig.cumulative.map((p) => p.value);
    expect(values).toEqual([...values].sort((a, b) => a - b)); // aldri synkende
    expect(ig.cumulative[0].value).toBe(2000);
  });

  it("plattformer uten startdato eller innlegg utelates", () => {
    expect(buildTotal(content, { instagram: "2026-06-15" }, TODAY)!.platforms.map((p) => p.platform)).toEqual(["instagram"]);
    expect(buildTotal([], TAKEOVER, TODAY)).toBeNull();
  });

  it("startdatoen hentes fra daily_activity (takeover_date), ikke hardkodet", () => {
    const rows = days("instagram", "REELS", "2026-09-01", "2026-09-02", 1, "2026-09-02", { takeover_date: "2026-06-15" });
    expect(takeoverDates(rows)).toEqual({ instagram: "2026-06-15" });
  });

  it("Feed-bryteren endrer ikke summen", () => {
    const daily = [
      ...days("instagram", "REELS", "2026-09-01", "2026-10-05", 10, "2026-10-05"),
      ...days("instagram", "FEED", "2026-09-01", "2026-10-05", 1, "2026-10-05"),
      ...days("youtube", "SHORTS", "2026-09-01", "2026-10-03", 5, "2026-10-03"),
    ];
    const off = buildTopp(daily, [], content, { periode: "total" }, TODAY, "2026-10-05").total!;
    const on = buildTopp(daily, [], content, { periode: "total", feed: "1" }, TODAY, "2026-10-05").total!;
    expect(on.views).toBe(off.views);
    expect(off.platforms[0].views).toBe(ig.views); // Feed-innlegget er med også når Feed er av
  });
});

describe("Total i adressen", () => {
  const series = buildSeries(days("instagram", "REELS", "2026-07-01", "2026-10-05", 10, "2026-10-05"));

  it("?periode=total gir Total uten piler, og standardvalget er fortsatt inneværende uke", () => {
    const state = readState({ periode: "total" }, TODAY);
    expect(state.total).toBe(true);
    expect(hrefFor(state)).toBe("/?periode=total");
    const nav = navigation(state, series, TODAY);
    expect([nav.prev, nav.next]).toEqual([null, null]);
    expect(nav.week).toBe("/?periode=uke&p=2026-W41");
    expect(nav.month).toBe("/?periode=m%C3%A5ned&p=2026-10");
    expect(readState({}, TODAY).total).toBe(false);
  });

  it("Feed-valget beholdes i Total", () => {
    const state = readState({ periode: "total", feed: "1" }, TODAY);
    expect(hrefFor(state)).toBe("/?periode=total&feed=1");
    expect(navigation(state, series, TODAY).feedToggle).toBe("/?periode=total");
    expect(navigation(readState({}, TODAY), series, TODAY).total).toBe("/?periode=total");
  });
});
