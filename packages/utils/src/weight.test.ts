import { describe, expect, it } from "vitest";
import { calculateWeightBasedPricePaise, formatGrams, gramsToKg, kgToGrams } from "./weight";

describe("gramsToKg / kgToGrams", () => {
  it("round-trips", () => {
    expect(gramsToKg(1500)).toBe(1.5);
    expect(kgToGrams(1.5)).toBe(1500);
  });
});

describe("formatGrams", () => {
  it("formats sub-kilogram as grams", () => {
    expect(formatGrams(350)).toBe("350g");
  });

  it("formats kilogram-and-above compactly", () => {
    expect(formatGrams(1000)).toBe("1kg");
    expect(formatGrams(1250)).toBe("1.25kg");
  });
});

describe("calculateWeightBasedPricePaise — the core Woobe pricing formula", () => {
  it("computes price from weight and rate/kg", () => {
    // 500g at ₹1,200/kg (120000 paise/kg) = 60000 paise = ₹600
    expect(calculateWeightBasedPricePaise(500, 120000)).toBe(60000);
  });

  it("handles the ADR-021 1kg minimum boundary", () => {
    expect(calculateWeightBasedPricePaise(1000, 120000)).toBe(120000);
  });

  it("rejects negative weight or rate", () => {
    expect(() => calculateWeightBasedPricePaise(-1, 100)).toThrow();
    expect(() => calculateWeightBasedPricePaise(100, -1)).toThrow();
  });
});
