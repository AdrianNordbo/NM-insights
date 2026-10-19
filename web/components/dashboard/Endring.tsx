import { formatNumber } from "@/lib/format";
import type { Change } from "@/lib/oversikt/endring";

/** «↘ −40 % mot 07.10–11.10 (5 dager før)», eller «↗ fra 764 …» når forrige verdi er under 1 000. */
export function Endring({ change, label }: { change: Change | null; label: string | null }) {
  if (!change || !label) return <span className="cmp">ingen sammenligning</span>;
  const arrow = change.direction === "up" ? "↗" : change.direction === "down" ? "↘" : "→";
  const text =
    change.percent != null
      ? `${change.percent > 0 ? "+" : change.percent < 0 ? "−" : "±"}${Math.round(Math.abs(change.percent * 100))} %`
      : `fra ${formatNumber(change.prev)}`;
  return (
    <span>
      <span className={`chg ${change.direction}`}>
        {arrow} {text}
      </span>
      <span className="cmp"> mot {label}</span>
    </span>
  );
}
