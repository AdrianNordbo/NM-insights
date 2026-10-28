import Link from "next/link";
import type { MonsterCard, MonsterSection } from "@/lib/analyse/monstre";
import { LABEL_NAME } from "@/lib/analyse/monstre";
import { formatNumber, formatPp, formatRatio, formatShare } from "@/lib/format";
import type { RecommendationBlock, RuleKind } from "@/lib/oversikt/anbefalinger";
import type { FreshGroup } from "@/lib/oversikt/ferske";
import type { OversiktModell } from "@/lib/oversikt/periodemodell";
import type { RecentPost } from "@/lib/oversikt/sist";
import type { PlattformValgDef } from "@/lib/regler/plattformer";
import { Borsgraf } from "./Borsgraf";
import { Endring } from "./Endring";
import { Filtre } from "./Filtre";
import { Info } from "./Info";
import { Minigraf } from "./Minigraf";

type Option = { key: string; label: string };

const BANK =
  "Bankinfo (Veksthusets egne informasjons- og reklameinnlegg) er med i totalene og kontotallene, men ikke i konsepter, anbefalinger, mønstre, medianer eller innleggslistene.";
const DEF =
  "Plattformene teller visninger ulikt (Instagram: Metas visninger, YouTube: avspillinger, TikTok: videovisninger, som kan inneholde betalt visning), så summer er ikke unike personer, og plattformene sammenlignes ikke med hverandre. Annonsevisninger (AD) er holdt utenfor for Instagram. Døgnene følger Stillehavstid for Instagram og YouTube og UTC for TikTok. «Total siden start» er levetidstall per innlegg publisert fra startdatoen.";
const INFO = {
  views: (alle: boolean) =>
    `${alle ? "Summen av visninger på Instagram (Reels og Feed), YouTube og TikTok. Feed er bare med i dette totaltallet, engasjementet og grafen, ikke i listene, kortene og konseptene. " : "Visninger for valget. "}${DEF} ${BANK}`,
  eng: (alle: boolean) =>
    `Likes + kommentarer + delinger (lagringer er ikke med).${alle ? " Summen tar med Instagram Feed, som totaltallet." : ""} Plattformene teller ulikt, så summen sammenlignes ikke på tvers. Annonsevisninger (AD) er holdt utenfor for Instagram. ${BANK}`,
  rate: "Engasjement (likes + kommentarer + delinger) delt på visninger, bare for dette valget. Kan ikke sammenlignes med andre plattformer. Endringen er i prosentpoeng (pp) mot like mange dager før.",
  now: "Summen av følgere og abonnenter på kontoene i dag. En sum av kontoer, ikke unike personer: samme person kan følge flere kontoer.",
  net: "Netto nye følgere/abonnenter = total ved periodens slutt minus total ved utgangen av dagen før. Følgere gjelder hele kontoen, også når Reels og Feed vises hver for seg. Netto summeres aldri på tvers av plattformer. «Total siden start» er netto siden startverdien.",
};
const KIND: Record<RuleKind, [string, string]> = { A: ["Mønster", ""], B: ["Mønster", ""], B2: ["Mønster", ""], C: ["Følg med", "warn"] };

export type OversiktProps = {
  valg: PlattformValgDef;
  periodeKey: string;
  periodeLabel: string;
  plattformer: Option[];
  perioder: Option[];
  model: OversiktModell | null;
  recs: RecommendationBlock[];
  patterns: (MonsterCard & { section: MonsterSection })[];
  fresh: FreshGroup[];
  recent: RecentPost[];
  error?: string | null;
};

export function OversiktVisning(p: OversiktProps) {
  const m = p.model;
  const alle = p.valg.key === "alle";
  const tidHref = `/publiseringstid?plattform=${p.valg.key}`;
  return (
    <>
      <div className="top">
        <div>
          <div className="eyebrow">Veksthuset</div>
          <h1>Oversikt</h1>
          <div className="sub">
            {p.valg.label} · {p.periodeLabel}
            {m && (
              <>
                {" "}
                · {m.periodLabel} <span className="chipnote">{m.lastNote}</span>
              </>
            )}
          </div>
        </div>
        <Filtre plattformer={p.plattformer} plattform={p.valg.key} perioder={p.perioder} periode={p.periodeKey} />
      </div>

      {p.error && <p className="notice">{p.error}</p>}
      {m?.coverage && (
        <div className="notice">
          <p>{m.coverage}, så summen dekker ikke hele perioden for alle plattformer og sammenlignes ikke.</p>
        </div>
      )}

      {m && <Kpier m={m} alle={alle} instagram={p.valg.key.startsWith("instagram")} />}

      {m && (
        <div className="layout">
          <div className="card">
            <h2>Utvikling per dag</h2>
            <div className="sub">
              Visninger øverst, interaksjoner (likes + kommentarer + delinger) under. Felles tidsakse.
              {alle && " Instagram Feed er med, som i totaltallet."}
            </div>
            {m.chart.note && <p className="micro">{m.chart.note}</p>}
            {m.chart.days.length ? <Borsgraf days={m.chart.days} prevLabel={m.prevLabel} /> : <p className="empty-state">Ingen døgn med data i perioden ennå ({m.lastNote}).</p>}
          </div>
          <div className="side-stack">
            {!m.isTotal && (
              <div className="card">
                <h2>Kort fortalt</h2>
                <div className="sub">{m.prevLabel ? `Mot ${m.prevLabel}` : m.lastNote}</div>
                {m.sentences.map((s) => (
                  <div key={s.platform} className="summary-line">
                    <span className={`plat p-${s.platform}`}>{s.name}</span>
                    <br />
                    {s.text}
                  </div>
                ))}
              </div>
            )}
            <Anbefalinger recs={p.recs} patterns={p.patterns} tidHref={tidHref} />
          </div>
        </div>
      )}

      {m?.cards && (
        <section className="section" aria-labelledby="per-plattform">
          <div className="section-head">
            <h2 id="per-plattform">Per plattform</h2>
            <span className="sub small">Hver plattform med egen siste dag · Instagram viser Reels</span>
          </div>
          <div className="grid-3">
            {m.cards.map((c) => (
              <article key={c.platform} className={`card pcard p-${c.platform}`}>
                <div className="pcard-head">
                  <span className={`plat p-${c.platform}`}>{c.name}</span>
                  <span className="pill neutral">{c.note}</span>
                </div>
                <div className="pcard-row">
                  <div>
                    <div className="kpi-label" style={{ marginTop: 14 }}>
                      Visninger
                    </div>
                    <span className="kpi-value">{formatNumber(c.views)}</span>
                    <Endring change={c.viewsChange} label={c.prevLabel} />
                  </div>
                  {c.spark.length > 1 && (
                    <div className="spark">
                      <Minigraf values={c.spark} label={`Visninger per døgn, ${c.name}`} />
                      <div className="spark-cap">per døgn</div>
                    </div>
                  )}
                </div>
                <dl className="kv">
                  <div>
                    <dt>Engasjement</dt>
                    <dd>{formatNumber(c.engagement)}</dd>
                  </div>
                  <div className="kv-sub">
                    <dt>Likes</dt>
                    <dd>{c.likes == null ? "–" : formatNumber(c.likes)}</dd>
                  </div>
                  <div className="kv-sub">
                    <dt>Kommentarer</dt>
                    <dd>{c.comments == null ? "–" : formatNumber(c.comments)}</dd>
                  </div>
                  <div className="kv-sub">
                    <dt>
                      Delinger <Info text="Delinger regnes ulikt per plattform (TikTok teller også «Send til venner»). Tallene sammenlignes ikke på tvers." label="Om delinger" />
                    </dt>
                    <dd>
                      {c.shares == null ? (c.engagement == null ? "–" : "ikke nok data") : formatNumber(c.shares)}
                      {c.shares != null && c.sharesMissing > 0 && (
                        <span className="note">
                          {" "}
                          ({c.sharesMissing} innlegg uten tall)
                        </span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Engasjementsrate</dt>
                    <dd>{formatShare(c.rate)}</dd>
                  </div>
                  <div>
                    <dt>Innlegg publisert</dt>
                    <dd>{formatNumber(c.posts)}</dd>
                  </div>
                </dl>
                <div className="pcard-follow">
                  <div className="kpi-label">{c.platform === "youtube" ? "Netto nye abonnenter" : "Netto nye følgere"}</div>
                  <span className="kpi-value">
                    {c.follow.value}
                    {c.follow.note && <span className="note">{c.follow.note}</span>}
                  </span>
                  {c.follow.source && <div className="small muted">{c.follow.source}</div>}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <div className="bottom">
        <Ferske groups={p.fresh} />
        <Sist rows={p.recent} />
      </div>
      <footer className="foot">
        Plattformene sammenlignes aldri med hverandre; summene er merket med info-ikon. Annonsevisninger (AD) er holdt utenfor for Instagram. Bankinfo er bare med i totaler og kontotall.
      </footer>
    </>
  );
}

function Kpier({ m, alle, instagram }: { m: OversiktModell; alle: boolean; instagram: boolean }) {
  const k = m.kpi;
  const f0 = k.followers[0];
  return (
    <div className="kpis">
      <div className="card">
        <div className="kpi-label">
          Totale visninger <Info text={INFO.views(alle)} />
        </div>
        <span className="kpi-value">{m.has ? formatNumber(k.views) : "–"}</span>
        {m.has ? m.isTotal ? <span className="cmp">levetidstall per innlegg</span> : <Endring change={k.viewsChange} label={m.prevLabel} /> : <span className="cmp">{m.lastNote}</span>}
      </div>
      <div className="card">
        <div className="kpi-label">
          Engasjement <Info text={INFO.eng(alle)} />
        </div>
        <span className="kpi-value">{m.has ? formatNumber(k.engagement) : "–"}</span>
        {m.has && !m.isTotal ? <Endring change={k.engagementChange} label={m.prevLabel} /> : <span className="cmp">likes + kommentarer + delinger</span>}
      </div>
      {alle ? (
        <div className="card">
          <div className="kpi-label">
            Følgere nå <Info text={INFO.now} right />
          </div>
          <span className="kpi-value">{formatNumber(k.followersNow)}</span>
          <span className="cmp">sum av kontoer, i dag</span>
        </div>
      ) : (
        <div className="card">
          <div className="kpi-label">
            Engasjementsrate <Info text={INFO.rate} right />
          </div>
          <span className="kpi-value">{formatShare(k.rate)}</span>
          {k.rateDiff != null && m.prevLabel ? (
            <span>
              <span className={`chg ${k.rateDiff > 0 ? "up" : k.rateDiff < 0 ? "down" : "same"}`}>
                {k.rateDiff > 0 ? "↗" : k.rateDiff < 0 ? "↘" : "→"} {formatPp(k.rateDiff)}
              </span>
              <span className="cmp"> mot {m.prevLabel}</span>
            </span>
          ) : (
            <span className="cmp">{m.isTotal ? "levetidstall per innlegg" : "ingen sammenligning"}</span>
          )}
        </div>
      )}
      <div className="card">
        <div className="kpi-label">
          Nye følgere (netto) <Info text={INFO.net} right />
        </div>
        {alle ? (
          <>
            <div className="fol-list">
              {k.followers.map((f) => (
                <div key={f.platform}>
                  <span className={`plat p-${f.platform}`}>{f.name}</span>
                  <span>
                    <b>{f.value}</b>
                    {f.note && <span className="note">{f.note}</span>}
                  </span>
                </div>
              ))}
            </div>
            {k.followers.some((f) => f.source) && (
              <div className="fol-src">{[...new Set(k.followers.map((f) => f.source).filter(Boolean))].join(" · ")}</div>
            )}
          </>
        ) : f0 ? (
          <>
            <span className="kpi-value">
              {f0.value}
              {f0.note && <span className="note">{f0.note}</span>}
            </span>
            <span className="cmp">{[instagram ? "hele Instagram-kontoen" : null, f0.source].filter(Boolean).join(" · ")}</span>
          </>
        ) : (
          <span className="kpi-value">–</span>
        )}
      </div>
    </div>
  );
}

function Anbefalinger({ recs, patterns, tidHref }: { recs: RecommendationBlock[]; patterns: (MonsterCard & { section: MonsterSection })[]; tidHref: string }) {
  const items = recs.flatMap((b) => [
    ...(b.recommendation ? [{ key: `${b.id}-r`, pill: KIND[b.recommendation.kind], platform: b.platform, name: b.name, text: b.recommendation.text, details: b.recommendation.details }] : []),
    ...(b.promising ? [{ key: `${b.id}-p`, pill: ["Test", "test"] as [string, string], platform: b.platform, name: b.name, text: b.promising.text, details: b.promising.details }] : []),
  ]);
  const shown = items.slice(0, 3);
  const rest = items.slice(3);
  const item = (it: (typeof items)[number]) => (
    <div key={it.key} className="insight">
      <div className="insight-head">
        <span className={`plat p-${it.platform}`}>{it.name}</span>
        <span className={`pill ${it.pill[1]}`}>{it.pill[0]}</span>
      </div>
      <h3>{it.text}</h3>
      <details className="more">
        <summary>Tallene</summary>
        <p>{it.details}</p>
      </details>
    </div>
  );
  return (
    <div className="card">
      <h2>Anbefalinger</h2>
      <div className="sub">Gjelder nå, uavhengig av valgt periode</div>
      {patterns.map((c) => (
        <div key={c.id} className="insight">
          <div className="insight-head">
            <span className={`plat p-${c.section.platform}`}>{c.section.name}</span>
            <span className={`pill ${c.label === "sikkert" ? "" : "neutral"}`}>{LABEL_NAME[c.label]}</span>
          </div>
          <h3>{c.advice}</h3>
          <p>{c.numbers}. En hypotese fra egne tall, ikke bevis.</p>
        </div>
      ))}
      {patterns.length > 0 && (
        <Link className="link rec-link" href={tidHref}>
          Se alle mønstre under Publiseringstid →
        </Link>
      )}
      {shown.map(item)}
      {rest.length > 0 && (
        <details className="more-recs">
          <summary>Vis flere ({rest.length})</summary>
          {rest.map(item)}
        </details>
      )}
      {!patterns.length && !items.length && <p className="empty-state small">Ingen tydelige signaler akkurat nå.</p>}
    </div>
  );
}

function Ferske({ groups }: { groups: FreshGroup[] }) {
  return (
    <div className="card">
      <h2>Ferske innlegg</h2>
      <div className="sub">Under 7 dager · tidlig signal, ikke endelige tall · uten Bankinfo</div>
      {groups.map((g) => (
        <div key={g.id}>
          <div className="group-name">
            <span className={`plat p-${g.platform}`}>{g.name}</span>
          </div>
          {g.posts.length ? (
            g.posts.map((p) => (
              <div key={p.id} className="post">
                <div className="info-col">
                  <strong>{p.permalink ? <a href={p.permalink} target="_blank" rel="noopener noreferrer">{p.title}</a> : p.title}</strong>
                  <small>
                    {[p.concept, p.published, p.age].filter(Boolean).join(" · ")}
                  </small>
                </div>
                <div className="views">
                  {p.pending ? (
                    <span className="pill neutral">venter på TikTok</span>
                  ) : (
                    <>
                      {formatNumber(p.views)}
                      <small className="muted"> visn.</small>
                    </>
                  )}
                </div>
              </div>
            ))
          ) : (
            <p className="muted small">Ingen innlegg de siste 7 dagene.</p>
          )}
        </div>
      ))}
    </div>
  );
}

function Sist({ rows }: { rows: RecentPost[] }) {
  return (
    <div className="card">
      <h2>Hva funket sist?</h2>
      <div className="sub">Beste innlegg publisert for 7–14 dager siden · uten Bankinfo</div>
      {rows.map((r) => (
        <div key={`${r.platform}-${r.format}`} className="post">
          <div className="info-col">
            <span className={`plat p-${r.platform}`}>{r.name}</span>
            {r.post ? (
              <>
                <strong style={{ marginTop: 6 }}>{r.post.permalink ? <a href={r.post.permalink} target="_blank" rel="noopener noreferrer">{r.post.title}</a> : r.post.title}</strong>
                <small>
                  {r.post.concept} · {r.post.published}
                </small>
              </>
            ) : (
              <small>Ingen innlegg i perioden.</small>
            )}
          </div>
          {r.post && (
            <div className="views">
              {formatNumber(r.post.views)}
              <small className="muted"> visn.</small>
              {r.ratio != null && (
                <>
                  <br />
                  <span className={`pill ${r.highlight ? "" : "neutral"}`}>{formatRatio(r.ratio)} av vanlig</span>
                </>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
