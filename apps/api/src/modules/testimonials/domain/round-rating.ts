/**
 * Deterministic one-decimal rounding for the public aggregate rating
 * display (e.g. "4.8 / 5") — never raw floating-point output. Not a money
 * figure, but the same "avoid float display confusion" posture the
 * schema's own money/weight rules establish elsewhere in this codebase.
 */
export function roundRating(average: number): number {
  return Math.round(average * 10) / 10;
}
