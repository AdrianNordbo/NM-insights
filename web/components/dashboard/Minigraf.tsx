/** Liten linje med fyll (visninger per døgn eller per uke). Ingen akser; tallene står ved siden av. */
export function Minigraf({ values, height = 46, label }: { values: (number | null)[]; height?: number; label: string }) {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length < 2) return <svg viewBox={`0 0 100 ${height}`} role="img" aria-label={label} />;
  const max = Math.max(...nums);
  const min = Math.min(0, ...nums);
  const x = (i: number) => (i / (values.length - 1)) * 100;
  const y = (v: number) => height - 3 - ((v - min) / (max - min || 1)) * (height - 6);
  let d = "";
  let first = -1;
  let last = -1;
  values.forEach((v, i) => {
    if (v == null) return;
    d += `${first < 0 ? "M" : "L"}${x(i).toFixed(2)},${y(v).toFixed(2)}`;
    if (first < 0) first = i;
    last = i;
  });
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" role="img" aria-label={label}>
      <path d={`${d}L${x(last)},${height}L${x(first)},${height}Z`} fill="var(--chart-fill)" />
      <path d={d} fill="none" stroke="var(--chart-line)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
