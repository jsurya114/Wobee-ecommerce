import type { CouponType } from "./entities/coupon.entity";

export interface CouponInputForValidation {
  type: CouponType;
  value: number;
  validFrom: Date;
  validTo: Date;
  usageLimit: number | null;
  perUserLimit: number | null;
  maxDiscountPaise: number | null;
}

/**
 * Pure domain function (ARCHITECTURE.md §3.1) — admin coupon management
 * (2026-09-03). The single place every cross-field coupon-shape rule lives,
 * so `CreateCouponUseCase` and `UpdateCouponUseCase` can both call it
 * against the FINAL, fully-resolved values (update merges the patch onto
 * the existing row first) rather than duplicating these checks per-schema.
 * `calculateCouponDiscount`'s own PERCENTAGE/FLAT split and
 * `resolveCouponEligibility`'s usageLimit/perUserLimit checks are
 * unaffected/untouched by this — this only rejects a shape those two would
 * otherwise have to silently tolerate (e.g. a 150% coupon, an expiry
 * before its own start date).
 */
export function validateCouponInput(input: CouponInputForValidation): string | null {
  if (input.type === "PERCENTAGE" && (input.value < 1 || input.value > 100)) {
    return "Percentage value must be between 1 and 100";
  }
  if (input.type === "FLAT" && input.value <= 0) {
    return "Flat discount value must be a positive amount";
  }
  if (input.validTo <= input.validFrom) {
    return "Expiry date must be after the start date";
  }
  if (input.perUserLimit !== null && input.usageLimit !== null && input.perUserLimit > input.usageLimit) {
    return "Per-user limit cannot exceed the overall usage limit";
  }
  if (input.maxDiscountPaise !== null && input.type !== "PERCENTAGE") {
    return "Maximum discount only applies to percentage coupons";
  }
  return null;
}
