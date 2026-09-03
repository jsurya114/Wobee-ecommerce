import { describe, expect, it } from "vitest";
import { validateCouponInput, type CouponInputForValidation } from "./validate-coupon-input";

function input(overrides: Partial<CouponInputForValidation> = {}): CouponInputForValidation {
  return {
    type: "PERCENTAGE",
    value: 10,
    validFrom: new Date("2026-01-01"),
    validTo: new Date("2026-02-01"),
    usageLimit: null,
    perUserLimit: null,
    maxDiscountPaise: null,
    ...overrides,
  };
}

describe("validateCouponInput", () => {
  it("passes a well-formed PERCENTAGE coupon", () => {
    expect(validateCouponInput(input())).toBeNull();
  });

  it("passes a well-formed FLAT coupon", () => {
    expect(validateCouponInput(input({ type: "FLAT", value: 5000, maxDiscountPaise: null }))).toBeNull();
  });

  it("rejects a PERCENTAGE value below 1", () => {
    expect(validateCouponInput(input({ value: 0 }))).toMatch(/between 1 and 100/);
  });

  it("rejects a PERCENTAGE value above 100", () => {
    expect(validateCouponInput(input({ value: 101 }))).toMatch(/between 1 and 100/);
  });

  it("rejects a non-positive FLAT value", () => {
    expect(validateCouponInput(input({ type: "FLAT", value: 0 }))).toMatch(/positive amount/);
  });

  it("rejects an expiry on or before the start date", () => {
    expect(validateCouponInput(input({ validFrom: new Date("2026-02-01"), validTo: new Date("2026-02-01") }))).toMatch(/after the start date/);
    expect(validateCouponInput(input({ validFrom: new Date("2026-02-01"), validTo: new Date("2026-01-01") }))).toMatch(/after the start date/);
  });

  it("rejects a per-user limit greater than the overall usage limit", () => {
    expect(validateCouponInput(input({ usageLimit: 10, perUserLimit: 11 }))).toMatch(/cannot exceed the overall usage limit/);
  });

  it("allows a per-user limit equal to or under the overall usage limit", () => {
    expect(validateCouponInput(input({ usageLimit: 10, perUserLimit: 10 }))).toBeNull();
    expect(validateCouponInput(input({ usageLimit: 10, perUserLimit: 1 }))).toBeNull();
  });

  it("allows either limit unset without comparing them", () => {
    expect(validateCouponInput(input({ usageLimit: null, perUserLimit: 5 }))).toBeNull();
    expect(validateCouponInput(input({ usageLimit: 5, perUserLimit: null }))).toBeNull();
  });

  it("rejects a maxDiscountPaise on a FLAT coupon", () => {
    expect(validateCouponInput(input({ type: "FLAT", value: 5000, maxDiscountPaise: 1000 }))).toMatch(/only applies to percentage/);
  });

  it("allows a maxDiscountPaise on a PERCENTAGE coupon", () => {
    expect(validateCouponInput(input({ maxDiscountPaise: 20000 }))).toBeNull();
  });
});
