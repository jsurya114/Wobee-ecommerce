import { describe, expect, it } from "vitest";
import { computeUnitCostSnapshot } from "./unit-cost-snapshot";

describe("computeUnitCostSnapshot", () => {
  it("WEIGHT_BASED: cost per kg x weight, rounded to a paise", () => {
    expect(computeUnitCostSnapshot({ pricingMode: "WEIGHT_BASED", costPerKgPaise: 80_000, costPricePaise: null, weightGrams: 250 })).toBe(20_000);
    expect(computeUnitCostSnapshot({ pricingMode: "WEIGHT_BASED", costPerKgPaise: 33_333, costPricePaise: null, weightGrams: 100 })).toBe(3333);
  });
  it("FIXED: the variant's per-piece cost, ignoring cost/kg", () => {
    expect(computeUnitCostSnapshot({ pricingMode: "FIXED", costPerKgPaise: 80_000, costPricePaise: 15_000, weightGrams: 250 })).toBe(15_000);
  });
  it("is null — never 0 — when the relevant cost is not configured", () => {
    expect(computeUnitCostSnapshot({ pricingMode: "WEIGHT_BASED", costPerKgPaise: null, costPricePaise: 9, weightGrams: 250 })).toBeNull();
    expect(computeUnitCostSnapshot({ pricingMode: "FIXED", costPerKgPaise: 80_000, costPricePaise: null, weightGrams: 250 })).toBeNull();
  });
  it("a configured zero cost is a real zero (free stock), distinct from unknown", () => {
    expect(computeUnitCostSnapshot({ pricingMode: "FIXED", costPerKgPaise: null, costPricePaise: 0, weightGrams: 10 })).toBe(0);
    expect(computeUnitCostSnapshot({ pricingMode: "WEIGHT_BASED", costPerKgPaise: 0, costPricePaise: null, weightGrams: 10 })).toBe(0);
  });
  it("zero-weight WEIGHT_BASED item costs 0 when cost/kg is set", () => {
    expect(computeUnitCostSnapshot({ pricingMode: "WEIGHT_BASED", costPerKgPaise: 50_000, costPricePaise: null, weightGrams: 0 })).toBe(0);
  });
  it("rejects negative inputs as unknown", () => {
    expect(computeUnitCostSnapshot({ pricingMode: "FIXED", costPerKgPaise: null, costPricePaise: -1, weightGrams: 1 })).toBeNull();
    expect(computeUnitCostSnapshot({ pricingMode: "WEIGHT_BASED", costPerKgPaise: -5, costPricePaise: null, weightGrams: 1 })).toBeNull();
  });
});
