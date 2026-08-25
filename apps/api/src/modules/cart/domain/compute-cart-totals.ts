export interface CartLineForTotals {
  quantity: number;
  unitPricePaise: number;
  weightGrams: number;
}

export interface CartTotals {
  itemCount: number;
  totalWeightGrams: number;
  totalPaise: number;
}

/**
 * Pure domain function — no I/O (ARCHITECTURE.md §3.1). This is what makes
 * "the server, not the client, computed this total" a checkable fact: the
 * same inputs always produce the same totals, unit-testable in isolation.
 */
export function computeCartTotals(lines: CartLineForTotals[]): CartTotals {
  return lines.reduce(
    (acc, line) => ({
      itemCount: acc.itemCount + line.quantity,
      totalWeightGrams: acc.totalWeightGrams + line.weightGrams * line.quantity,
      totalPaise: acc.totalPaise + line.unitPricePaise * line.quantity,
    }),
    { itemCount: 0, totalWeightGrams: 0, totalPaise: 0 },
  );
}
