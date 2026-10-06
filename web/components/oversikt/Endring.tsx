import { formatNumber } from "@/lib/format";
import { pillText } from "@/lib/oversikt/endring";
import type { Delta } from "@/lib/oversikt/kort";

/** Pille med endring («▲ 22 %» eller bare pil) og forrige periodes verdi, f.eks. «uke 38: 1 234». */
export function Endring({ delta }: { delta: Delta }) {
  const c = delta.change;
  if (!c) return <span className="delta muted">ingen sammenligning</span>;
  return (
    <span className="delta">
      <span className={`pill ${c.direction}`}>{pillText(c)}</span>
      <span className="delta-prev">
        {delta.prevLabel}: {formatNumber(c.prev)}
      </span>
    </span>
  );
}
