import { describe, expect, it } from "vitest";
import { resolveShippingEvaluation } from "./resolve-shipping";

const rule = { minWeightGramsForCheckout: 1000, freeDeliveryThresholdGrams: 1500, standardFeePaise: 5000 };

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
});
