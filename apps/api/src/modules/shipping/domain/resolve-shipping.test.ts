import { describe, expect, it } from "vitest";
import { checkPincodeServiceability, resolveShippingEvaluation } from "./resolve-shipping";

const rule = {
  minWeightGramsForCheckout: 1000,
  freeDeliveryThresholdGrams: 1500,
  standardFeePaise: 5000,
  estimatedDeliveryDaysMin: 3,
  estimatedDeliveryDaysMax: 7,
  freeDeliveryMinSubtotalPaise: 0,
};

describe("resolveShippingEvaluation", () => {
  it("blocks checkout under the minimum weight", () => {
    const result = resolveShippingEvaluation(700, rule);
    expect(result.meetsMinimum).toBe(false);
    expect(result.isFreeDelivery).toBe(false);
    expect(result.shippingFeePaise).toBe(0);
    expect(result.gramsToMinimum).toBe(300);
  });

  it("charges the standard fee between the minimum and the free-delivery threshold", () => {
    const result = resolveShippingEvaluation(1200, rule);
    expect(result.meetsMinimum).toBe(true);
    expect(result.isFreeDelivery).toBe(false);
    expect(result.shippingFeePaise).toBe(5000);
    expect(result.gramsToFreeDelivery).toBe(300);
  });

  it("waives the fee at or above the free-delivery threshold", () => {
    const result = resolveShippingEvaluation(1500, rule);
    expect(result.meetsMinimum).toBe(true);
    expect(result.isFreeDelivery).toBe(true);
    expect(result.shippingFeePaise).toBe(0);
    expect(result.gramsToFreeDelivery).toBe(0);
  });

  it("passes the live rule's delivery estimate through unchanged", () => {
    const result = resolveShippingEvaluation(1200, rule);
    expect(result.estimatedDeliveryDaysMin).toBe(3);
    expect(result.estimatedDeliveryDaysMax).toBe(7);
  });

  // 2026-08-31 — caller passes weightBasedTotalGrams (cart/domain/compute-cart-totals.ts),
  // not physical total weight. A cart with zero weight-based items (all
  // fixed-price accessories, or empty) never blocks checkout on this
  // formerly-clothing-only mechanic, and never reaches free delivery either.
  it("never blocks checkout when there are no weight-based items, and doesn't grant free delivery either", () => {
    const result = resolveShippingEvaluation(0, rule);
    expect(result.meetsMinimum).toBe(true);
    expect(result.isFreeDelivery).toBe(false);
    expect(result.shippingFeePaise).toBe(rule.standardFeePaise);
    expect(result.gramsToMinimum).toBe(0);
    expect(result.gramsToFreeDelivery).toBe(0);
  });

  describe("free delivery by items subtotal (admin settings, 2026-09-28)", () => {
    const withPriceRule = { ...rule, freeDeliveryMinSubtotalPaise: 200_000 }; // ₹2,000

    it("is off by default (0) — a large subtotal alone never waives the fee", () => {
      const result = resolveShippingEvaluation(1200, rule, 9_999_900);
      expect(result.isFreeDelivery).toBe(false);
      expect(result.shippingFeePaise).toBe(5000);
      expect(result.paiseToFreeDelivery).toBe(0);
    });

    it("waives the fee once the subtotal reaches the threshold, even below the weight threshold", () => {
      const result = resolveShippingEvaluation(1200, withPriceRule, 200_000);
      expect(result.meetsMinimum).toBe(true);
      expect(result.isFreeDelivery).toBe(true);
      expect(result.shippingFeePaise).toBe(0);
      expect(result.gramsToFreeDelivery).toBe(0);
      expect(result.paiseToFreeDelivery).toBe(0);
    });

    it("reports how much more subtotal is needed while under the threshold", () => {
      const result = resolveShippingEvaluation(1200, withPriceRule, 150_000);
      expect(result.isFreeDelivery).toBe(false);
      expect(result.shippingFeePaise).toBe(5000);
      expect(result.paiseToFreeDelivery).toBe(50_000);
    });

    it("still grants free delivery by weight alone (either condition qualifies)", () => {
      const result = resolveShippingEvaluation(1500, withPriceRule, 10_000);
      expect(result.isFreeDelivery).toBe(true);
      expect(result.paiseToFreeDelivery).toBe(0);
    });

    it("applies to an all-fixed-price cart too (no weight-based items)", () => {
      const result = resolveShippingEvaluation(0, withPriceRule, 250_000);
      expect(result.meetsMinimum).toBe(true);
      expect(result.isFreeDelivery).toBe(true);
      expect(result.shippingFeePaise).toBe(0);
    });

    it("never lifts the minimum-weight block — free delivery is not permission to check out", () => {
      const result = resolveShippingEvaluation(700, withPriceRule, 500_000);
      expect(result.meetsMinimum).toBe(false);
      expect(result.gramsToMinimum).toBe(300);
    });
  });
});

describe("checkPincodeServiceability", () => {
  it("accepts a well-formed 6-digit pincode", () => {
    expect(checkPincodeServiceability("560001")).toEqual({ serviceable: true });
  });

  it("rejects a pincode with the wrong number of digits", () => {
    const result = checkPincodeServiceability("12345");
    expect(result.serviceable).toBe(false);
    expect(result.reason).toMatch(/valid 6-digit/i);
  });

  it("rejects a pincode containing non-digit characters", () => {
    const result = checkPincodeServiceability("56000A");
    expect(result.serviceable).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(checkPincodeServiceability("").serviceable).toBe(false);
  });
});
