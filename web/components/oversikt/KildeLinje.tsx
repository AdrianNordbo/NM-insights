/**
 * Dempet linje under følgertallene: brutto, «fra X til Y» og kildeetiketter («beregnet fra Meta Insikt»).
 * Hver del brytes aldri midt i; blir linjen for trang (f.eks. 375 px), går neste del ned på en ny linje.
 */
export function KildeLinje({ parts }: { parts: (string | null | undefined)[] }) {
  const shown = parts.flatMap((p) => (p ? p.split(" · ") : []));
  if (!shown.length) return null;
  return (
    <p className="hero-follow-sub">
      {shown.map((part, i) => (
        <span key={`${i}-${part}`} className="src-part">
          {i > 0 && <span aria-hidden="true">· </span>}
          {part}
        </span>
      ))}
    </p>
  );
}
