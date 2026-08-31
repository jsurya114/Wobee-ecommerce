import { describe, expect, it } from "vitest";
import { ValidationError } from "../../../shared/errors";
import { resolveEffectivePrice } from "./resolve-effective-price";

const DEFAULT_RATE = 120_000; // ₹1,200/kg

describe("resolveEffectivePrice", () => {
  it("derives price from weight × rate for WEIGHT_BASED, using the default rate when no override is set", () => {
    const result = resolveEffectivePrice(
      { pricingMode: "WEIGHT_BASED", weightGrams: 500, ratePerKgOverridePaise: null, fixedPricePaise: null },
      DEFAULT_RATE,
    );
    expect(result).toEqual({ pricePaise: 60_000, ratePerKgPaise: DEFAULT_RATE });
  });

  it("prefers the variant's rate override over the default for WEIGHT_BASED", () => {
    const result = resolveEffectivePrice(
      { pricingMode: "WEIGHT_BASED", weightGrams: 500, ratePerKgOverridePaise: 90_000, fixedPricePaise: null },
      DEFAULT_RATE,
    );
    expect(result).toEqual({ pricePaise: 45_000, ratePerKgPaise: 90_000 });
  });

  it("returns the admin-set fixedPricePaise verbatim for FIXED, with a null ratePerKgPaise", () => {
    const result = resolveEffectivePrice(
      { pricingMode: "FIXED", weightGrams: 32, ratePerKgOverridePaise: null, fixedPricePaise: 3_800 },
      DEFAULT_RATE,
    );
    expect(result).toEqual({ pricePaise: 3_800, ratePerKgPaise: null });
  });

  it("ignores ratePerKgOverridePaise for FIXED — weight/rate never factor into a fixed-price product's price", () => {
    const result = resolveEffectivePrice(
      { pricingMode: "FIXED", weightGrams: 32, ratePerKgOverridePaise: 500_000, fixedPricePaise: 3_800 },
      DEFAULT_RATE,
    );
    expect(result.pricePaise).toBe(3_800);
  });

  it("throws for a FIXED variant with no fixedPricePaise set — never silently defaults to 0 or falls back to weight math", () => {
    expect(() =>
      resolveEffectivePrice({ pricingMode: "FIXED", weightGrams: 32, ratePerKgOverridePaise: null, fixedPricePaise: null }, DEFAULT_RATE),
    ).toThrow(ValidationError);
  });
});
