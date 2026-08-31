import type { PricingMode } from "@woobe/types";

export interface CartLineForTotals {
  quantity: number;
  unitPricePaise: number;
  weightGrams: number;
  /** 2026-08-31 — see `weightBasedTotalGrams` below. */
  pricingMode: PricingMode;
}

export interface CartTotals {
  itemCount: number;
  /** Physical weight of EVERY item, regardless of pricing mode — real shipping weight, unchanged by the 2026-08-31 fixed-pricing rule. */
  totalWeightGrams: number;
  /**
   * 2026-08-31 — physical weight of WEIGHT_BASED items only. This, not
   * `totalWeightGrams`, is what the checkout-minimum / free-delivery
   * thresholds are evaluated against (see resolve-shipping.ts): the
   * "smart cart" weight incentive is a weight-based-pricing mechanic, and a
   * shopper buying only fixed-price accessories should never be blocked or
   * un-blocked by their weight.
   */
  weightBasedTotalGrams: number;
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
      weightBasedTotalGrams: acc.weightBasedTotalGrams + (line.pricingMode === "WEIGHT_BASED" ? line.weightGrams * line.quantity : 0),
      totalPaise: acc.totalPaise + line.unitPricePaise * line.quantity,
    }),
    { itemCount: 0, totalWeightGrams: 0, weightBasedTotalGrams: 0, totalPaise: 0 },
  );
}
