import { describe, expect, it } from "vitest";
import { resolveCouponEligibility } from "./resolve-coupon-eligibility";
import type { CouponEntity } from "./entities/coupon.entity";

function coupon(overrides: Partial<CouponEntity> = {}): CouponEntity {
  return {
    id: "coupon-1",
    code: "TESTCODE",
    type: "PERCENTAGE",
    value: 10,
    minCartValuePaise: null,
    maxDiscountPaise: null,
    usageLimit: null,
    perUserLimit: null,
    validFrom: new Date("2026-01-01"),
    validTo: new Date("2026-12-31"),
    isActive: true,
    productIds: [],
    categoryIds: [],
    ...overrides,
  };
}

const baseContext = {
  now: new Date("2026-06-15"),
  cartSubtotalPaise: 10_000,
  globalRedemptionCount: 0,
  userRedemptionCount: 0,
  lines: [{ variantId: "v1", productId: "p1", categoryId: "c1", lineTotalPaise: 10_000 }],
};

describe("resolveCouponEligibility", () => {
  it("rejects an inactive coupon", () => {
    const result = resolveCouponEligibility(coupon({ isActive: false }), baseContext);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/no longer active/i);
  });

  it("rejects before validFrom", () => {
    const result = resolveCouponEligibility(coupon(), { ...baseContext, now: new Date("2025-12-31") });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/expired/i);
  });

  it("rejects after validTo", () => {
    const result = resolveCouponEligibility(coupon(), { ...baseContext, now: new Date("2027-01-01") });
    expect(result.ok).toBe(false);
  });

  it("accepts exactly at validFrom/validTo boundaries", () => {
    expect(resolveCouponEligibility(coupon(), { ...baseContext, now: new Date("2026-01-01") }).ok).toBe(true);
    expect(resolveCouponEligibility(coupon(), { ...baseContext, now: new Date("2026-12-31") }).ok).toBe(true);
  });

  it("rejects when the cart subtotal is under minCartValuePaise", () => {
    const result = resolveCouponEligibility(coupon({ minCartValuePaise: 20_000 }), baseContext);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/minimum order value/i);
  });

  it("accepts exactly at minCartValuePaise", () => {
    expect(resolveCouponEligibility(coupon({ minCartValuePaise: 10_000 }), baseContext).ok).toBe(true);
  });

  it("rejects once the global usage limit is reached", () => {
    const result = resolveCouponEligibility(coupon({ usageLimit: 5 }), { ...baseContext, globalRedemptionCount: 5 });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/usage limit/i);
  });

  it("rejects once the per-user limit is reached", () => {
    const result = resolveCouponEligibility(coupon({ perUserLimit: 1 }), { ...baseContext, userRedemptionCount: 1 });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/maximum number of times/i);
  });

  it("applies cart-wide when the coupon has no product/category restriction", () => {
    const lines = [
      { variantId: "v1", productId: "p1", categoryId: "c1", lineTotalPaise: 3000 },
      { variantId: "v2", productId: "p2", categoryId: "c2", lineTotalPaise: 7000 },
    ];
    const result = resolveCouponEligibility(coupon(), { ...baseContext, lines });
    expect(result.ok).toBe(true);
    expect(result.eligibleLines).toHaveLength(2);
    expect(result.eligibleLineTotalPaise).toBe(10_000);
  });

  it("restricts to matching products only when productIds is set", () => {
    const lines = [
      { variantId: "v1", productId: "p1", categoryId: "c1", lineTotalPaise: 3000 },
      { variantId: "v2", productId: "p2", categoryId: "c2", lineTotalPaise: 7000 },
    ];
    const result = resolveCouponEligibility(coupon({ productIds: ["p1"] }), { ...baseContext, lines });
    expect(result.ok).toBe(true);
    expect(result.eligibleLines).toEqual([lines[0]]);
    expect(result.eligibleLineTotalPaise).toBe(3000);
  });

  it("restricts to matching categories only when categoryIds is set", () => {
    const lines = [
      { variantId: "v1", productId: "p1", categoryId: "c1", lineTotalPaise: 3000 },
      { variantId: "v2", productId: "p2", categoryId: "c2", lineTotalPaise: 7000 },
    ];
    const result = resolveCouponEligibility(coupon({ categoryIds: ["c2"] }), { ...baseContext, lines });
    expect(result.ok).toBe(true);
    expect(result.eligibleLines).toEqual([lines[1]]);
  });

  it("matches a line satisfying EITHER the product OR category restriction (independent facets, not a strict intersection)", () => {
    const lines = [
      { variantId: "v1", productId: "p1", categoryId: "other-category", lineTotalPaise: 3000 }, // matches by product
      { variantId: "v2", productId: "other-product", categoryId: "c1", lineTotalPaise: 4000 }, // matches by category
      { variantId: "v3", productId: "other-product", categoryId: "other-category", lineTotalPaise: 5000 }, // matches neither
    ];
    const result = resolveCouponEligibility(coupon({ productIds: ["p1"], categoryIds: ["c1"] }), { ...baseContext, lines });
    expect(result.ok).toBe(true);
    expect(result.eligibleLines).toHaveLength(2);
    expect(result.eligibleLineTotalPaise).toBe(7000);
  });

  it("rejects when a restriction is set but nothing in the cart matches", () => {
    const result = resolveCouponEligibility(coupon({ productIds: ["some-other-product"] }), baseContext);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/doesn't apply to any items/i);
  });

  it("distinguishes two lines that share a productId (two variants of the same product) via variantId", () => {
    const lines = [
      { variantId: "v1-small", productId: "p1", categoryId: "c1", lineTotalPaise: 3000 },
      { variantId: "v1-large", productId: "p1", categoryId: "c1", lineTotalPaise: 4000 },
    ];
    const result = resolveCouponEligibility(coupon(), { ...baseContext, lines });
    expect(result.eligibleLines.map((l) => l.variantId)).toEqual(["v1-small", "v1-large"]);
  });
});
