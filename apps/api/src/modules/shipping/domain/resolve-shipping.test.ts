import { describe, expect, it } from "vitest";
import { checkPincodeServiceability, resolveShippingEvaluation } from "./resolve-shipping";

const rule = {
  minWeightGramsForCheckout: 1000,
  freeDeliveryThresholdGrams: 1500,
  standardFeePaise: 5000,
  estimatedDeliveryDaysMin: 3,
  estimatedDeliveryDaysMax: 7,
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
