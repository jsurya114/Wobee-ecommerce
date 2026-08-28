import type { CouponEntity } from "./entities/coupon.entity";

/**
 * Pure, dependency-free (week2 (1).md §9's "Calculate discount" step) —
 * PERCENTAGE rounds down (never charges the customer more than the stated
 * percentage would produce), capped by `maxDiscountPaise` when set, and the
 * result can never exceed the eligible line total itself regardless of type
 * (a FLAT discount larger than what's in the bag would otherwise produce a
 * negative subtotal — DEVELOPMENT_RULES.md-style "never go negative" rule).
 */
export function calculateCouponDiscount(coupon: Pick<CouponEntity, "type" | "value" | "maxDiscountPaise">, eligibleLineTotalPaise: number): number {
  let discountPaise = coupon.type === "PERCENTAGE" ? Math.floor((eligibleLineTotalPaise * coupon.value) / 100) : coupon.value;

  if (coupon.maxDiscountPaise !== null) {
    discountPaise = Math.min(discountPaise, coupon.maxDiscountPaise);
  }

  return Math.min(discountPaise, eligibleLineTotalPaise);
}
