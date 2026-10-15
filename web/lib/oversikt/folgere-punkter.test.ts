// follower_points mot de ekte tallene (dashboard.follower_points og dashboard.followers, hentet 15.10.2026).
// Dataene under er en kopi av viewene (bare feltene testene trenger): [dag, total, type] der type
// m = målt, k = kontrollpunkt, b = beregnet, og [dag, brutto nye].
import { describe, expect, it } from "vitest";
import type { FollowerPointRow, FollowerRow, Platform } from "../data/types";
import { addDays } from "../format";
import { buildFollowerSeries, followersNow, netto, nettoView } from "./folgere";

const IG_POINTS = [["2026-06-30",374,"k"],["2026-07-31",427,"k"],["2026-08-31",464,"k"],["2026-09-29",505,"m"],["2026-09-30",507,"m"],["2026-10-01",506,"m"],["2026-10-02",505,"m"],["2026-10-03",507,"m"],["2026-10-04",509,"m"],["2026-10-05",510,"m"],["2026-10-06",511,"m"],["2026-10-07",511,"m"],["2026-10-08",512,"m"],["2026-10-09",514,"m"],["2026-10-10",515,"m"],["2026-10-11",513,"m"],["2026-10-12",513,"m"],["2026-10-13",514,"m"],["2026-10-14",515,"m"],["2026-10-15",515,"m"]];
const IG_GROSS = [["2026-08-30",0],["2026-08-31",1],["2026-09-01",3],["2026-09-02",7],["2026-09-03",5],["2026-09-04",1],["2026-09-05",4],["2026-09-06",3],["2026-09-07",0],["2026-09-08",3],["2026-09-09",2],["2026-09-10",0],["2026-09-11",0],["2026-09-12",0],["2026-09-13",0],["2026-09-14",2],["2026-09-15",0],["2026-09-16",3],["2026-09-17",1],["2026-09-18",1],["2026-09-19",0],["2026-09-20",1],["2026-09-21",0],["2026-09-22",0],["2026-09-23",4],["2026-09-24",1],["2026-09-25",0],["2026-09-26",1],["2026-09-27",1],["2026-09-28",1],["2026-09-29",1],["2026-09-30",0],["2026-10-01",1],["2026-10-02",1],["2026-10-03",3],["2026-10-04",1],["2026-10-05",1],["2026-10-06",1],["2026-10-07",3],["2026-10-08",0],["2026-10-09",0],["2026-10-10",0],["2026-10-11",2],["2026-10-12",0],["2026-10-13",0],["2026-10-14",0]];
const YT_POINTS = [["2026-06-04",0,"b"],["2026-06-05",0,"b"],["2026-06-06",0,"b"],["2026-06-07",0,"b"],["2026-06-08",0,"b"],["2026-06-09",0,"b"],["2026-06-10",0,"b"],["2026-06-11",0,"b"],["2026-06-12",0,"b"],["2026-06-13",0,"b"],["2026-06-14",0,"b"],["2026-06-15",0,"b"],["2026-06-16",3,"b"],["2026-06-17",3,"b"],["2026-06-18",3,"b"],["2026-06-19",3,"b"],["2026-06-20",3,"b"],["2026-06-21",3,"b"],["2026-06-22",3,"b"],["2026-06-23",3,"b"],["2026-06-24",4,"b"],["2026-06-25",5,"b"],["2026-06-26",5,"b"],["2026-06-27",5,"b"],["2026-06-28",6,"b"],["2026-06-29",9,"b"],["2026-06-30",10,"b"],["2026-07-01",16,"b"],["2026-07-02",24,"b"],["2026-07-03",25,"b"],["2026-07-04",27,"b"],["2026-07-05",28,"b"],["2026-07-06",29,"b"],["2026-07-07",29,"b"],["2026-07-08",31,"b"],["2026-07-09",31,"b"],["2026-07-10",31,"b"],["2026-07-11",31,"b"],["2026-07-12",31,"b"],["2026-07-13",31,"b"],["2026-07-14",32,"b"],["2026-07-15",32,"b"],["2026-07-16",32,"b"],["2026-07-17",32,"b"],["2026-07-18",32,"b"],["2026-07-19",32,"b"],["2026-07-20",32,"b"],["2026-07-21",32,"b"],["2026-07-22",32,"b"],["2026-07-23",33,"b"],["2026-07-24",33,"b"],["2026-07-25",33,"b"],["2026-07-26",33,"b"],["2026-07-27",33,"b"],["2026-07-28",32,"b"],["2026-07-29",32,"b"],["2026-07-30",32,"b"],["2026-07-31",32,"b"],["2026-08-01",32,"b"],["2026-08-02",32,"b"],["2026-08-03",32,"b"],["2026-08-04",33,"b"],["2026-08-05",33,"b"],["2026-08-06",33,"b"],["2026-08-07",33,"b"],["2026-08-08",33,"b"],["2026-08-09",33,"b"],["2026-08-10",33,"b"],["2026-08-11",33,"b"],["2026-08-12",33,"b"],["2026-08-13",33,"b"],["2026-08-14",33,"b"],["2026-08-15",34,"b"],["2026-08-16",34,"b"],["2026-08-17",34,"b"],["2026-08-18",35,"b"],["2026-08-19",35,"b"],["2026-08-20",35,"b"],["2026-08-21",35,"b"],["2026-08-22",35,"b"],["2026-08-23",35,"b"],["2026-08-24",35,"b"],["2026-08-25",35,"b"],["2026-08-26",35,"b"],["2026-08-27",35,"b"],["2026-08-28",35,"b"],["2026-08-29",35,"b"],["2026-08-30",35,"b"],["2026-08-31",36,"b"],["2026-09-01",36,"b"],["2026-09-02",36,"b"],["2026-09-03",36,"b"],["2026-09-04",36,"b"],["2026-09-05",36,"b"],["2026-09-06",37,"b"],["2026-09-07",37,"b"],["2026-09-08",37,"b"],["2026-09-09",37,"b"],["2026-09-10",37,"b"],["2026-09-11",37,"b"],["2026-09-12",37,"b"],["2026-09-13",38,"b"],["2026-09-14",38,"b"],["2026-09-15",39,"b"],["2026-09-16",39,"b"],["2026-09-17",39,"b"],["2026-09-18",39,"b"],["2026-09-19",39,"b"],["2026-09-20",39,"b"],["2026-09-21",39,"b"],["2026-09-22",39,"b"],["2026-09-23",39,"b"],["2026-09-24",39,"b"],["2026-09-25",39,"b"],["2026-09-26",39,"b"],["2026-09-27",39,"b"],["2026-09-28",39,"b"],["2026-09-29",39,"b"],["2026-09-30",39,"m"],["2026-10-01",39,"m"],["2026-10-02",39,"m"],["2026-10-03",39,"m"],["2026-10-04",40,"m"],["2026-10-05",40,"m"],["2026-10-06",40,"m"],["2026-10-07",40,"m"],["2026-10-08",40,"m"],["2026-10-09",40,"m"],["2026-10-10",40,"m"],["2026-10-11",40,"m"],["2026-10-12",40,"m"],["2026-10-13",40,"m"],["2026-10-14",40,"m"],["2026-10-15",40,"m"]];
const YT_GROSS = [["2026-06-04",0],["2026-06-05",0],["2026-06-06",0],["2026-06-07",0],["2026-06-08",0],["2026-06-09",0],["2026-06-10",0],["2026-06-11",0],["2026-06-12",0],["2026-06-13",0],["2026-06-14",0],["2026-06-15",0],["2026-06-16",3],["2026-06-17",0],["2026-06-18",0],["2026-06-19",0],["2026-06-20",0],["2026-06-21",0],["2026-06-22",0],["2026-06-23",0],["2026-06-24",1],["2026-06-25",1],["2026-06-26",0],["2026-06-27",0],["2026-06-28",1],["2026-06-29",3],["2026-06-30",1],["2026-07-01",7],["2026-07-02",9],["2026-07-03",2],["2026-07-04",2],["2026-07-05",1],["2026-07-06",1],["2026-07-07",1],["2026-07-08",2],["2026-07-09",0],["2026-07-10",0],["2026-07-11",0],["2026-07-12",0],["2026-07-13",0],["2026-07-14",1],["2026-07-15",0],["2026-07-16",0],["2026-07-17",0],["2026-07-18",0],["2026-07-19",0],["2026-07-20",0],["2026-07-21",0],["2026-07-22",0],["2026-07-23",1],["2026-07-24",0],["2026-07-25",0],["2026-07-26",0],["2026-07-27",0],["2026-07-28",0],["2026-07-29",0],["2026-07-30",0],["2026-07-31",0],["2026-08-01",0],["2026-08-02",0],["2026-08-03",0],["2026-08-04",1],["2026-08-05",0],["2026-08-06",0],["2026-08-07",0],["2026-08-08",0],["2026-08-09",0],["2026-08-10",0],["2026-08-11",0],["2026-08-12",0],["2026-08-13",1],["2026-08-14",0],["2026-08-15",1],["2026-08-16",0],["2026-08-17",0],["2026-08-18",1],["2026-08-19",0],["2026-08-20",0],["2026-08-21",0],["2026-08-22",0],["2026-08-23",0],["2026-08-24",0],["2026-08-25",0],["2026-08-26",0],["2026-08-27",0],["2026-08-28",0],["2026-08-29",0],["2026-08-30",0],["2026-08-31",1],["2026-09-01",0],["2026-09-02",0],["2026-09-03",0],["2026-09-04",0],["2026-09-05",0],["2026-09-06",1],["2026-09-07",0],["2026-09-08",0],["2026-09-09",0],["2026-09-10",0],["2026-09-11",0],["2026-09-12",0],["2026-09-13",1],["2026-09-14",0],["2026-09-15",1],["2026-09-16",0],["2026-09-17",0],["2026-09-18",0],["2026-09-19",0],["2026-09-20",0],["2026-09-21",0],["2026-09-22",0],["2026-09-23",0],["2026-09-24",0],["2026-09-25",0],["2026-09-26",0],["2026-09-27",0],["2026-09-28",0],["2026-09-29",0],["2026-09-30",0],["2026-10-01",0],["2026-10-02",0],["2026-10-03",0],["2026-10-04",1],["2026-10-05",0],["2026-10-06",0],["2026-10-07",0],["2026-10-08",0],["2026-10-09",0],["2026-10-10",0],["2026-10-11",0],["2026-10-12",0]];
const TT_POINTS = [["2026-06-30",85,"k"],["2026-07-31",134,"k"],["2026-08-14",148,"m"],["2026-08-15",150,"m"],["2026-08-16",151,"m"],["2026-08-17",154,"m"],["2026-08-18",155,"m"],["2026-08-19",157,"m"],["2026-08-20",159,"m"],["2026-08-21",172,"m"],["2026-08-22",178,"m"],["2026-08-23",182,"m"],["2026-08-24",183,"m"],["2026-08-25",184,"m"],["2026-08-26",183,"m"],["2026-08-27",187,"m"],["2026-08-28",189,"m"],["2026-08-29",193,"m"],["2026-08-30",197,"m"],["2026-08-31",199,"m"],["2026-09-01",200,"m"],["2026-09-02",202,"m"],["2026-09-03",204,"m"],["2026-09-04",206,"m"],["2026-09-05",209,"m"],["2026-09-06",209,"m"],["2026-09-07",210,"m"],["2026-09-08",213,"m"],["2026-09-09",217,"m"],["2026-09-10",221,"m"],["2026-09-11",222,"m"],["2026-09-12",222,"m"],["2026-09-13",223,"m"],["2026-09-14",223,"m"],["2026-09-15",224,"m"],["2026-09-16",226,"m"],["2026-09-17",229,"m"],["2026-09-18",228,"m"],["2026-09-19",228,"m"],["2026-09-20",231,"m"],["2026-09-21",231,"m"],["2026-09-22",231,"m"],["2026-09-23",232,"m"],["2026-09-24",231,"m"],["2026-09-25",237,"m"],["2026-09-26",237,"m"],["2026-09-27",239,"m"],["2026-09-28",243,"m"],["2026-09-29",243,"m"],["2026-09-30",242,"m"],["2026-10-01",243,"m"],["2026-10-02",246,"m"],["2026-10-03",246,"m"],["2026-10-04",248,"m"],["2026-10-05",248,"m"],["2026-10-06",248,"m"],["2026-10-07",248,"m"],["2026-10-08",250,"m"],["2026-10-09",251,"m"],["2026-10-10",252,"m"],["2026-10-11",253,"m"],["2026-10-12",253,"m"],["2026-10-13",253,"m"],["2026-10-14",253,"m"],["2026-10-15",253,"m"]];
const TT_GROSS: [string, number][] = []; // TikTok har ingen brutto

const KIND = { m: "målt", k: "kontrollpunkt", b: "beregnet" } as const;
const SOURCE: Record<Platform, string> = {
  instagram: "Meta Insikt (beregnet)",
  youtube: "YouTube Analytics (beregnet)",
  tiktok: "TikTok Studio (beregnet)",
};
const ACCOUNT: Record<Platform, number> = { instagram: 1, youtube: 2, tiktok: 3 };
const START: Record<Platform, [number, string]> = {
  instagram: [339, "beregnet fra Meta Insikt (515 − 197 nye + 21 sluttet, 15.06–15.10)"],
  youtube: [0, "YouTube Analytics (nye − tapte 04.06–14.06)"],
  tiktok: [0, "kontoen ble opprettet med 0 følgere"],
};

function pointRows(platform: Platform, data: [string, number, "m" | "k" | "b"][]): FollowerPointRow[] {
  return data.map(([day, total, k]) => ({
    platform, account_id: ACCOUNT[platform], day, total, kind: KIND[k], source: k === "m" ? null : SOURCE[platform], read_at: null,
  }));
}

/** dashboard.followers: målt total + brutto, med startverdien fra accounts. */
function followerRows(platform: Platform, points: [string, number, string][], gross: [string, number][]): FollowerRow[] {
  const days = new Set([...points.filter((p) => p[2] === "m").map((p) => p[0]), ...gross.map((g) => g[0])]);
  const total = new Map(points.filter((p) => p[2] === "m").map((p) => [p[0], p[1]]));
  const g = new Map(gross);
  return [...days].sort().map((day) => ({
    platform, account_id: ACCOUNT[platform], day,
    followers_count: total.get(day) ?? null, new_followers: g.get(day) ?? null, takeover_date: "2026-06-15",
    followers_start: START[platform][0], followers_start_date: "2026-06-15", followers_start_source: START[platform][1],
  }));
}

const ROWS = [
  ...followerRows("instagram", IG_POINTS as [string, number, string][], IG_GROSS as [string, number][]),
  ...followerRows("youtube", YT_POINTS as [string, number, string][], YT_GROSS as [string, number][]),
  ...followerRows("tiktok", TT_POINTS as [string, number, string][], TT_GROSS as [string, number][]),
];
const POINTS = [
  ...pointRows("instagram", IG_POINTS as [string, number, "m" | "k" | "b"][]),
  ...pointRows("youtube", YT_POINTS as [string, number, "m" | "k" | "b"][]),
  ...pointRows("tiktok", TT_POINTS as [string, number, "m" | "k" | "b"][]),
];
const TODAY = "2026-10-15";
const series = buildFollowerSeries(ROWS, POINTS);
const S = (p: Platform) => series.find((s) => s.platform === p)!;
const month = (p: Platform, start: string, end: string) => nettoView(netto(S(p), start, end, TODAY));

describe("follower_points: prioritet og kilder", () => {
  it("målt > kontrollpunkt > beregnet samme dag", () => {
    const rows: FollowerPointRow[] = [
      { platform: "tiktok", account_id: 3, day: "2026-08-31", total: 200, kind: "kontrollpunkt", source: "TikTok Studio (beregnet)", read_at: null },
      { platform: "tiktok", account_id: 3, day: "2026-08-31", total: 199, kind: "målt", source: null, read_at: null },
      { platform: "youtube", account_id: 2, day: "2026-09-29", total: 38, kind: "beregnet", source: "YouTube Analytics (beregnet)", read_at: null },
      { platform: "youtube", account_id: 2, day: "2026-09-29", total: 39, kind: "kontrollpunkt", source: "x", read_at: null },
    ];
    const s = buildFollowerSeries([], rows);
    expect(s.find((x) => x.platform === "tiktok")!.points).toEqual([{ day: "2026-08-31", value: 199, kind: "målt", source: null }]);
    expect(s.find((x) => x.platform === "youtube")!.points[0]).toMatchObject({ value: 39, kind: "kontrollpunkt" });
  });

  it("uten follower_points brukes bare målte totaler (som før)", () => {
    const s = buildFollowerSeries(ROWS, null);
    expect(s.every((x) => x.points.every((p) => p.kind === "målt"))).toBe(true);
    expect(nettoView(netto(s[0], "2026-09-01", "2026-09-30", TODAY))).toMatchObject({ value: "+2", note: "målt fra 29.09" });
  });

  it("følgere nå er alltid siste målte punkt", () => {
    expect(followersNow(S("instagram"))).toEqual({ value: 515, day: "2026-10-15" });
    expect(followersNow(S("youtube"))).toEqual({ value: 40, day: "2026-10-15" });
    expect(followersNow(S("tiktok"))).toEqual({ value: 253, day: "2026-10-15" });
  });
});

describe("YouTube: beregnet fra Analytics før 30.09, målt etter", () => {
  it("overgangen henger sammen: 28.09 = 29.09 (beregnet) = 30.09 (målt) = 39", () => {
    const p = (d: string) => S("youtube").points.find((x) => x.day === d);
    expect([p("2026-09-28"), p("2026-09-29"), p("2026-09-30")]).toEqual([
      { day: "2026-09-28", value: 39, kind: "beregnet", source: "YouTube Analytics (beregnet)" },
      { day: "2026-09-29", value: 39, kind: "beregnet", source: "YouTube Analytics (beregnet)" },
      { day: "2026-09-30", value: 39, kind: "målt", source: null },
    ]);
  });

  it("måneder: juni +10 fra 04.06, juli +22, august +4, september +3 (unntak: Analytics → Data API), oktober +1", () => {
    expect(month("youtube", "2026-06-01", "2026-06-30")).toEqual({ value: "+10", note: "fra 04.06", sourceLabel: "beregnet fra YouTube Analytics" });
    expect(month("youtube", "2026-07-01", "2026-07-31")).toEqual({ value: "+22", note: null, sourceLabel: "beregnet fra YouTube Analytics" });
    expect(month("youtube", "2026-08-01", "2026-08-31")).toEqual({ value: "+4", note: null, sourceLabel: "beregnet fra YouTube Analytics" });
    expect(month("youtube", "2026-09-01", "2026-09-30")).toEqual({ value: "+3", note: null, sourceLabel: "beregnet fra YouTube Analytics" });
    expect(month("youtube", "2026-10-01", "2026-10-31")).toEqual({ value: "+1", note: "hittil", sourceLabel: null });
  });

  it("uker: 27 +22, 31 −1, 40 +1 (beregnet → målt), 41 0", () => {
    expect(month("youtube", "2026-06-29", "2026-07-05").value).toBe("+22");
    expect(month("youtube", "2026-07-27", "2026-08-02").value).toBe("−1");
    expect(month("youtube", "2026-09-28", "2026-10-04")).toEqual({ value: "+1", note: null, sourceLabel: "beregnet fra YouTube Analytics" });
    expect(month("youtube", "2026-10-05", "2026-10-11")).toEqual({ value: "0", note: null, sourceLabel: null });
  });
});

describe("Instagram: kontrollpunkter fra Meta Insikt", () => {
  it("juni +35 fra 15.06 (startverdi), juli +53, august +37, september +43 (kontrollpunkt → målt)", () => {
    expect(month("instagram", "2026-06-01", "2026-06-30")).toEqual({ value: "+35", note: "fra 15.06", sourceLabel: "beregnet fra Meta Insikt" });
    expect(month("instagram", "2026-07-01", "2026-07-31")).toEqual({ value: "+53", note: null, sourceLabel: "beregnet fra Meta Insikt" });
    expect(month("instagram", "2026-08-01", "2026-08-31")).toEqual({ value: "+37", note: null, sourceLabel: "beregnet fra Meta Insikt" });
    expect(month("instagram", "2026-09-01", "2026-09-30")).toEqual({ value: "+43", note: null, sourceLabel: "beregnet fra Meta Insikt" });
    expect(month("instagram", "2026-10-01", "2026-10-31")).toEqual({ value: "+8", note: "hittil", sourceLabel: null });
  });

  it("alle uker før 29.09 er «ikke nok data» («sluttet» finnes ikke per uke)", () => {
    for (let d = "2026-06-15"; d <= "2026-09-21"; d = addDays(d, 7)) {
      expect(month("instagram", d, addDays(d, 6)).value, `uke fra ${d}`).toBe("ikke nok data");
    }
    expect(month("instagram", "2026-09-28", "2026-10-04")).toMatchObject({ value: "+4", note: "målt fra 29.09" }); // 505 → 509
  });
});

describe("TikTok: kontrollpunkter fra TikTok Studio og målt fra 14.08", () => {
  it("juni +85 fra 15.06 (startverdi 0), juli +49, august +65, september +43", () => {
    expect(month("tiktok", "2026-06-01", "2026-06-30")).toEqual({ value: "+85", note: "fra 15.06", sourceLabel: "kontoen startet på 0 · beregnet fra TikTok Studio" });
    expect(month("tiktok", "2026-07-01", "2026-07-31")).toEqual({ value: "+49", note: null, sourceLabel: "beregnet fra TikTok Studio" });
    expect(month("tiktok", "2026-08-01", "2026-08-31")).toEqual({ value: "+65", note: null, sourceLabel: "beregnet fra TikTok Studio" });
    expect(month("tiktok", "2026-09-01", "2026-09-30")).toEqual({ value: "+43", note: null, sourceLabel: null });
  });

  it("virker også med startverdi 3 (avviket TikTok Studio +82 i juni)", () => {
    const rows3 = ROWS.map((r) => (r.platform === "tiktok" ? { ...r, followers_start: 3, followers_start_source: "TikTok Studio (beregnet)" } : r));
    const s = buildFollowerSeries(rows3, POINTS).find((x) => x.platform === "tiktok")!;
    expect(nettoView(netto(s, "2026-06-01", "2026-06-30", TODAY))).toEqual({ value: "+82", note: "fra 15.06", sourceLabel: "beregnet fra TikTok Studio" });
  });

  it("uker før 14.08 er «ikke nok data»; uker fra 14.08 virker som før", () => {
    for (let d = "2026-06-15"; d <= "2026-08-03"; d = addDays(d, 7)) {
      expect(month("tiktok", d, addDays(d, 6)).value, `uke fra ${d}`).toBe("ikke nok data");
    }
    expect(month("tiktok", "2026-08-10", "2026-08-16")).toMatchObject({ note: "målt fra 14.08" });
    expect(month("tiktok", "2026-08-17", "2026-08-23")).toEqual({ value: "+31", note: null, sourceLabel: null }); // 151 → 182
  });
});

describe("kort og Total med follower_points", async () => {
  const { buildTopp } = await import("./side");
  const { days } = await import("./testdata");
  const daily = [
    ...days("instagram", "REELS", "2026-06-01", "2026-10-14", 100, "2026-10-14"),
    ...days("youtube", "SHORTS", "2026-06-01", "2026-10-12", 10, "2026-10-12"),
    ...days("tiktok", "ALL", "2026-08-14", "2026-10-13", 50, "2026-10-13"),
  ];
  const card = (params: Record<string, string>, p: Platform) =>
    buildTopp(daily, [], [], params, TODAY, "2026-10-14", ROWS, POINTS).heroes.find((h) => h.platform === p)!;

  it("brutto skjules når netto bare dekker en del av perioden («fra dd.mm»)", () => {
    const juni = card({ periode: "måned", p: "2026-06" }, "youtube");
    expect(juni.followers?.netto?.note).toBe("fra 04.06");
    expect(juni.followers?.gross).toBeNull();
    const juli = card({ periode: "måned", p: "2026-07" }, "youtube");
    expect(juli.followers?.gross).toEqual({ label: "Nye abonnenter", value: 27 });
  });

  it("Total: «fra X til Y» og kildeetiketten når utgangspunktet ikke er målt", () => {
    const total = buildTopp(daily, [], [], { periode: "total" }, TODAY, "2026-10-14", ROWS, POINTS).total;
    // Uten innhold er det ingen plattformkort i Total; selve følgerdelen testes direkte:
    expect(total).toBeNull();
    const n = netto(S("instagram"), "2026-06-15", TODAY, TODAY);
    expect(n).toMatchObject({ change: 176, from: 339, to: 515, fromKind: "startverdi" });
    const y = netto(S("youtube"), "2026-06-15", TODAY, TODAY);
    expect(y).toMatchObject({ change: 40, from: 0, fromKind: "beregnet", measuredFrom: false });
    expect(nettoView(y).sourceLabel).toBe("beregnet fra YouTube Analytics");
  });
});
