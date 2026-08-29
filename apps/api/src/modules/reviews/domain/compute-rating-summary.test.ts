import { describe, expect, it } from "vitest";
import { computeRatingSummary } from "./compute-rating-summary";

describe("computeRatingSummary", () => {
  it("returns zeroed summary for no reviews", () => {
    expect(computeRatingSummary([])).toEqual({
      averageRating: 0,
      reviewCount: 0,
      breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    });
  });

  it("computes the weighted average and total count across ratings", () => {
    const summary = computeRatingSummary([
      { rating: 5, count: 3 },
      { rating: 4, count: 1 },
      { rating: 1, count: 1 },
    ]);
    // (5*3 + 4*1 + 1*1) / 5 = 20/5 = 4.0
    expect(summary.averageRating).toBe(4);
    expect(summary.reviewCount).toBe(5);
    expect(summary.breakdown).toEqual({ 1: 1, 2: 0, 3: 0, 4: 1, 5: 3 });
  });

  it("rounds the average to one decimal place", () => {
    const summary = computeRatingSummary([
      { rating: 5, count: 1 },
      { rating: 4, count: 1 },
      { rating: 4, count: 1 },
    ]);
    // (5 + 4 + 4) / 3 = 4.333...
    expect(summary.averageRating).toBe(4.3);
  });

  it("only counts ratings that appear, leaving other stars at zero", () => {
    const summary = computeRatingSummary([{ rating: 3, count: 2 }]);
    expect(summary.breakdown).toEqual({ 1: 0, 2: 0, 3: 2, 4: 0, 5: 0 });
  });
});
