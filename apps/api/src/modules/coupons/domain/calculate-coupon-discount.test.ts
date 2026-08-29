import { describe, expect, it } from "vitest";
import { calculateCouponDiscount } from "./calculate-coupon-discount";

describe("calculateCouponDiscount", () => {
  it("computes a percentage discount, rounded down", () => {
    // 10% of 9999 = 999.9 -> floors to 999, never charges the customer more than stated
    expect(calculateCouponDiscount({ type: "PERCENTAGE", value: 10, maxDiscountPaise: null }, 9999)).toBe(999);
  });

  it("computes a flat discount", () => {
    expect(calculateCouponDiscount({ type: "FLAT", value: 5000, maxDiscountPaise: null }, 20_000)).toBe(5000);
  });

  it("caps a percentage discount at maxDiscountPaise", () => {
    // 20% of 100,000 = 20,000, capped at 5,000
    expect(calculateCouponDiscount({ type: "PERCENTAGE", value: 20, maxDiscountPaise: 5000 }, 100_000)).toBe(5000);
  });

  it("never exceeds the eligible line total, even for a large FLAT discount", () => {
    expect(calculateCouponDiscount({ type: "FLAT", value: 10_000, maxDiscountPaise: null }, 3000)).toBe(3000);
  });

  it("never exceeds the eligible line total for a PERCENTAGE discount either (100% case)", () => {
    expect(calculateCouponDiscount({ type: "PERCENTAGE", value: 100, maxDiscountPaise: null }, 5000)).toBe(5000);
  });

  it("returns zero for a zero eligible total", () => {
    expect(calculateCouponDiscount({ type: "PERCENTAGE", value: 50, maxDiscountPaise: null }, 0)).toBe(0);
  });
});
