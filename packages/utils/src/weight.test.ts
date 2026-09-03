import { describe, expect, it } from "vitest";
import { calculateWeightBasedPricePaise, formatGrams, gramsToKg, kgToGrams, sumWeightBasedGrams } from "./weight";

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

describe("sumWeightBasedGrams — client-review fix 2026-09-04 (cart/order 'Total weight' display)", () => {
  it("excludes FIXED-priced lines (unitRatePerKgPaise: null) entirely", () => {
    const items = [
      { weightGrams: 300, quantity: 1, unitRatePerKgPaise: 120000 }, // weight-based garment
      { weightGrams: 15, quantity: 1, unitRatePerKgPaise: null }, // FIXED accessory
    ];
    expect(sumWeightBasedGrams(items)).toBe(300);
  });

  it("does not move when a FIXED line's quantity increases", () => {
    const before = sumWeightBasedGrams([
      { weightGrams: 300, quantity: 1, unitRatePerKgPaise: 120000 },
      { weightGrams: 15, quantity: 1, unitRatePerKgPaise: null },
    ]);
    const after = sumWeightBasedGrams([
      { weightGrams: 300, quantity: 1, unitRatePerKgPaise: 120000 },
      { weightGrams: 15, quantity: 2, unitRatePerKgPaise: null },
    ]);
    expect(after).toBe(before);
  });

  it("sums multiple weight-based lines by quantity", () => {
    const items = [
      { weightGrams: 380, quantity: 3, unitRatePerKgPaise: 90000 },
      { weightGrams: 120, quantity: 1, unitRatePerKgPaise: null },
    ];
    expect(sumWeightBasedGrams(items)).toBe(1140);
  });

  it("returns 0 for an all-FIXED cart", () => {
    expect(sumWeightBasedGrams([{ weightGrams: 120, quantity: 2, unitRatePerKgPaise: null }])).toBe(0);
  });
});
