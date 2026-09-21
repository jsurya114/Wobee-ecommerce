/** n / d as a percentage rounded to 1 dp; null when the denominator is 0 or either side is missing (never Infinity/NaN). */
export function pct(numerator: number | null | undefined, denominator: number | null | undefined): number | null {
  if (numerator == null || denominator == null || !Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

/** n / d rounded to an integer (paise); null when the denominator is 0. */
export function ratioRounded(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Math.round(numerator / denominator) : null;
}

/**
 * Percentage change vs the previous period, 1 dp. Null whenever there is no
 * meaningful comparison: no previous period, previous is 0/negative (a delta
 * from zero is undefined, not "+Infinity%"), or either side is missing.
 */
export function deltaPct(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null || !Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}
