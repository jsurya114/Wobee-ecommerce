import { describe, expect, it } from "vitest";
import { allocateCouponDiscount } from "./allocate-coupon-discount";

describe("allocateCouponDiscount", () => {
  it("returns an empty map when there's no discount", () => {
    const result = allocateCouponDiscount(0, [{ variantId: "v1", lineTotalPaise: 10_000 }]);
    expect(result.size).toBe(0);
  });

  it("returns an empty map when there are no eligible lines", () => {
    const result = allocateCouponDiscount(1000, []);
    expect(result.size).toBe(0);
  });

  it("allocates the whole discount to a single eligible line", () => {
    const result = allocateCouponDiscount(1000, [{ variantId: "v1", lineTotalPaise: 10_000 }]);
    expect(result.get("v1")).toBe(1000);
  });

  it("allocates proportionally across two eligible lines that split evenly", () => {
    const result = allocateCouponDiscount(1000, [
      { variantId: "v1", lineTotalPaise: 5000 },
      { variantId: "v2", lineTotalPaise: 5000 },
    ]);
    expect(result.get("v1")).toBe(500);
    expect(result.get("v2")).toBe(500);
  });

  it("sums to exactly discountPaise even when the proportional split doesn't divide evenly", () => {
    // 100 paise across shares of 1/3, 1/3, 1/3 -> 33.33 each; naive
    // flooring would only distribute 99 of the 100 paise.
    const result = allocateCouponDiscount(100, [
      { variantId: "v1", lineTotalPaise: 10_000 },
      { variantId: "v2", lineTotalPaise: 10_000 },
      { variantId: "v3", lineTotalPaise: 10_000 },
    ]);
    const total = [...result.values()].reduce((sum, v) => sum + v, 0);
    expect(total).toBe(100);
    for (const v of result.values()) {
      expect(v).toBeGreaterThanOrEqual(33);
      expect(v).toBeLessThanOrEqual(34);
    }
  });

  it("weights larger lines with a larger share of the discount", () => {
    const result = allocateCouponDiscount(1000, [
      { variantId: "small", lineTotalPaise: 2000 },
      { variantId: "large", lineTotalPaise: 8000 },
    ]);
    expect(result.get("small")).toBe(200);
    expect(result.get("large")).toBe(800);
  });

  it("ignores a line with zero total (no share to allocate)", () => {
    const result = allocateCouponDiscount(1000, [
      { variantId: "v1", lineTotalPaise: 0 },
      { variantId: "v2", lineTotalPaise: 10_000 },
    ]);
    expect(result.get("v1")).toBe(0);
    expect(result.get("v2")).toBe(1000);
  });
});
