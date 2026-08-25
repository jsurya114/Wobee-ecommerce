/**
 * Pure domain function (ARCHITECTURE.md §3.1) — `now` and `randomSuffix`
 * are both passed in rather than read internally (Date.now()/crypto inside
 * this file), so it stays trivially unit-testable even though each real
 * call produces a different, non-repeating result. Human-readable + roughly
 * chronological, unlike a bare uuid — useful for support conversations
 * ("what's your order number?").
 */
export function generateOrderNumber(now: Date, randomSuffix: string): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `WOOBE-${year}${month}${day}-${randomSuffix.toUpperCase()}`;
}
