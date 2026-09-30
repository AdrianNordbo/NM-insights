import { addDays, daysInclusive } from "../format";

type FollowerPeriod = {
  period_start: string;
  period_end: string;
  period_complete: boolean;
  days_with_follower_data: number;
};

/**
 * Antall dager med følgerdata vi forventer i perioden (regelen i CLAUDE.md):
 * ferdig periode = hele periodens lengde; periode som ikke er ferdig = fra start til og med i går
 * (dagens døgn er aldri ferdig hos Meta eller YouTube).
 */
export function expectedFollowerDays(period: FollowerPeriod, today: string): number {
  if (period.period_complete) return daysInclusive(period.period_start, period.period_end);
  const yesterday = addDays(today, -1);
  if (yesterday < period.period_start) return 0;
  const last = yesterday < period.period_end ? yesterday : period.period_end;
  return daysInclusive(period.period_start, last);
}

/** Følgertall vises bare når alle forventede dager har data; ellers «Ikke nok data». */
export function hasEnoughFollowerData(period: FollowerPeriod, today: string): boolean {
  const expected = expectedFollowerDays(period, today);
  return expected > 0 && period.days_with_follower_data >= expected;
}
