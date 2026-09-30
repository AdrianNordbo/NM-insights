import { Forelopig, InfoIkon } from "./InfoIkon";
import { formatDayMonth, formatNumber, formatRatio } from "@/lib/format";
import type { RecentPost } from "@/lib/forside/sist";
import { FORMAT_NAME, PLATFORM_NAME } from "@/lib/navn";
import { KILDER } from "@/lib/kilder";

export function HvaFunketSistKort({ item }: { item: RecentPost }) {
  const { post } = item;
  // Fremheves bare når det er beste av flere og minst like godt som vanlig for konseptet.
  const highlight = item.state === "best" && item.ratio != null && item.ratio >= 1 && !item.preliminary;

  return (
    <article className="card">
      <header className="card-head">
        <h3>
          {PLATFORM_NAME[item.platform]} · {FORMAT_NAME[item.format]}
        </h3>
      </header>
      {!post ? (
        <p className="muted small">Ingen innlegg i perioden.</p>
      ) : (
        <>
          {item.state === "single" && <p className="muted small label">Eneste innlegg i perioden</p>}
          <p className="post-title">
            {post.permalink ? (
              <a href={post.permalink} target="_blank" rel="noopener noreferrer">
                {post.title ?? "(uten tittel)"} <span aria-hidden="true">↗</span>
                <span className="sr-only"> (åpnes i ny fane)</span>
              </a>
            ) : (
              (post.title ?? "(uten tittel)")
            )}
          </p>
          <p className="muted small">
            {post.concept ?? "Uten konsept"}
            {post.special_event ? ` · ${post.special_event}` : ""} · {formatDayMonth(post.published_at)}
          </p>
          <p className="metric">
            <span className="big">{formatNumber(post.views)}</span> <span className="muted">visninger</span>
          </p>
          {item.ratio != null && (
            <p className={highlight ? "ratio highlight" : "ratio"}>
              {formatRatio(item.ratio)} av vanlig{" "}
              <InfoIkon id={`ganger-${item.platform}-${item.format}`} text={KILDER.ganger} />
              {item.preliminary && <Forelopig />}
            </p>
          )}
        </>
      )}
    </article>
  );
}
