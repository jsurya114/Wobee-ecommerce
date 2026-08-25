import { describe, expect, it } from "vitest";
import { computeCartTotals } from "./compute-cart-totals";

describe("computeCartTotals", () => {
  it("returns zeroed totals for an empty cart", () => {
    expect(computeCartTotals([])).toEqual({ itemCount: 0, totalWeightGrams: 0, totalPaise: 0 });
  });

  it("sums quantity, weight, and price across lines — weight and price scale with quantity per line", () => {
    const totals = computeCartTotals([
      { quantity: 2, unitPricePaise: 74_400, weightGrams: 620 },
      { quantity: 1, unitPricePaise: 3_000, weightGrams: 25 },
    ]);

    expect(totals).toEqual({
      itemCount: 3,
      totalWeightGrams: 2 * 620 + 25,
      totalPaise: 2 * 74_400 + 3_000,
    });
  });
});
