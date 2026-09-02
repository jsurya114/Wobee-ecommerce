import { describe, expect, it } from "vitest";
import { resolveEffectiveRatePerKgPaise } from "./resolve-effective-rate";

describe("resolveEffectiveRatePerKgPaise", () => {
  it("always returns the global default rate — the per-variant override is deprecated and must never win", () => {
    expect(resolveEffectiveRatePerKgPaise(120_000, 150_000)).toBe(120_000);
  });

  it("returns the default rate when there is no legacy override", () => {
    expect(resolveEffectiveRatePerKgPaise(120_000, null)).toBe(120_000);
    expect(resolveEffectiveRatePerKgPaise(120_000, undefined)).toBe(120_000);
  });

  it("ignores a legacy override of 0 just the same as any other legacy value — it is inert, not a special case", () => {
    expect(resolveEffectiveRatePerKgPaise(120_000, 0)).toBe(120_000);
  });

  it("CRITICAL FINANCIAL TEST: a legacy override far below the current global rate cannot discount the price", () => {
    // Legacy row priced as if ₹9/kg (900 paise/kg-equivalent in this test's units); global rate is ₹1,200/kg.
    // The override must be completely inert — the global rate always wins.
    expect(resolveEffectiveRatePerKgPaise(120_000, 90_000)).toBe(120_000);
  });
});
