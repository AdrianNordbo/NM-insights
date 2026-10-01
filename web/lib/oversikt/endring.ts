// Endring mot forrige periode. Prosent vises bare når forrige verdi er minst 1 000; ellers blir
// prosentene misvisende store (fra 3 til 19 er «+533 %»), og forrige verdi vises i stedet.

export const PERCENT_MIN_PREV = 1000;

export type Direction = "up" | "down" | "same";

export type Change = {
  direction: Direction;
  /** Relativ endring, f.eks. 0.22. Null når forrige verdi er under 1 000. */
  percent: number | null;
  prev: number;
};

/** Null når det ikke finnes noe å sammenligne med. */
export function change(current: number, prev: number | null): Change | null {
  if (prev == null) return null;
  const direction: Direction = current > prev ? "up" : current < prev ? "down" : "same";
  const percent = prev >= PERCENT_MIN_PREV ? (current - prev) / prev : null;
  return { direction, percent, prev };
}

const ARROW: Record<Direction, string> = { up: "▲", down: "▼", same: "=" };
const pct = new Intl.NumberFormat("nb-NO", { style: "percent", maximumFractionDigits: 0 });

/** Teksten i pillen: «▲ 22 %», eller bare «▲» når prosent ikke vises. */
export function pillText(c: Change): string {
  return c.percent == null ? ARROW[c.direction] : `${ARROW[c.direction]} ${pct.format(Math.abs(c.percent))}`;
}
