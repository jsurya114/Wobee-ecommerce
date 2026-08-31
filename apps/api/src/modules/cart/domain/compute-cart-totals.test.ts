import { describe, expect, it } from "vitest";
import { computeCartTotals } from "./compute-cart-totals";

describe("computeCartTotals", () => {
  it("returns zeroed totals for an empty cart", () => {
    expect(computeCartTotals([])).toEqual({ itemCount: 0, totalWeightGrams: 0, weightBasedTotalGrams: 0, totalPaise: 0 });
  });

  it("sums quantity, weight, and price across lines — weight and price scale with quantity per line", () => {
    const totals = computeCartTotals([
      { quantity: 2, unitPricePaise: 74_400, weightGrams: 620, pricingMode: "WEIGHT_BASED" },
      { quantity: 1, unitPricePaise: 3_000, weightGrams: 25, pricingMode: "WEIGHT_BASED" },
    ]);

    expect(totals).toEqual({
      itemCount: 3,
      totalWeightGrams: 2 * 620 + 25,
      weightBasedTotalGrams: 2 * 620 + 25,
      totalPaise: 2 * 74_400 + 3_000,
    });
  });

  // 2026-08-31 — fixed-price items still count toward physical weight
  // (real shipping weight) but never toward weightBasedTotalGrams (the
  // "smart cart" checkout-minimum/free-delivery mechanic only applies to
  // weight-based/clothing items).
  it("excludes FIXED lines from weightBasedTotalGrams but keeps them in totalWeightGrams", () => {
    const totals = computeCartTotals([
      { quantity: 1, unitPricePaise: 74_400, weightGrams: 620, pricingMode: "WEIGHT_BASED" },
      { quantity: 2, unitPricePaise: 3_800, weightGrams: 32, pricingMode: "FIXED" },
    ]);

    expect(totals).toEqual({
      itemCount: 3,
      totalWeightGrams: 620 + 2 * 32,
      weightBasedTotalGrams: 620,
      totalPaise: 74_400 + 2 * 3_800,
    });
  });

  it("a cart of only FIXED items has zero weightBasedTotalGrams despite non-zero physical weight", () => {
    const totals = computeCartTotals([{ quantity: 1, unitPricePaise: 3_800, weightGrams: 32, pricingMode: "FIXED" }]);

    expect(totals.totalWeightGrams).toBe(32);
    expect(totals.weightBasedTotalGrams).toBe(0);
  });
});
