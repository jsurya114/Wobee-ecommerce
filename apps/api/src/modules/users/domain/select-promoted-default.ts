/**
 * Week 2 Day 3 (week2 (1).md §7 — "Enforce one default address where
 * required"). The plan doesn't say what happens when a customer deletes
 * their current default and other addresses remain — decided here rather
 * than left implicit: promote the oldest remaining address, so a customer
 * with a saved address is never left with zero default (checkout/order
 * history UX depending on "the default address" would otherwise silently
 * break). Pure, dependency-free domain logic — no I/O — so it's testable in
 * isolation, same pattern as `resolveMergedQuantity`/`resolveShippingEvaluation`.
 */
export function selectPromotedDefault(remaining: { id: string; createdAt: Date }[]): string | null {
  if (remaining.length === 0) {
    return null;
  }
  return remaining.reduce((oldest, candidate) => (candidate.createdAt < oldest.createdAt ? candidate : oldest)).id;
}
