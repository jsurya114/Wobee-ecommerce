import { describe, expect, it } from "vitest";
import { resolveEffectiveRatePerKgPaise } from "./resolve-effective-rate";

describe("resolveEffectiveRatePerKgPaise", () => {
  it("uses the variant's override when set", () => {
    expect(resolveEffectiveRatePerKgPaise(120_000, 150_000)).toBe(150_000);
  });

  it("falls back to the default rate when there is no override", () => {
    expect(resolveEffectiveRatePerKgPaise(120_000, null)).toBe(120_000);
    expect(resolveEffectiveRatePerKgPaise(120_000, undefined)).toBe(120_000);
  });

  it("treats an override of 0 as a real value, not 'unset' (a free/promo variant is a valid business case)", () => {
    expect(resolveEffectiveRatePerKgPaise(120_000, 0)).toBe(0);
  });
});
