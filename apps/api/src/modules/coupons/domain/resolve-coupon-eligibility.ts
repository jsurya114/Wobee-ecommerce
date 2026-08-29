import type { CouponEntity } from "./entities/coupon.entity";

export interface CouponLineInput {
  /** Not read by this function's own eligibility logic (matching is by productId/categoryId only) — carried through so a caller (checkout) can trace which returned `eligibleLines` entry corresponds to which actual order line, since two lines can share a productId (the same product in two sizes/colors is two CartItems). */
  variantId: string;
  productId: string;
  categoryId: string;
  lineTotalPaise: number;
}

export interface CouponEligibilityContext {
  now: Date;
  /** Full, live cart subtotal — "minimum order value" checks against the whole cart, not just the eligible subset (week2 (1).md §9's own bullet ordering: "Minimum order value" is a top-level rule, "Determine eligible items" is the separate next step). */
  cartSubtotalPaise: number;
  /** Existing CouponRedemption count for this coupon, across all users. */
  globalRedemptionCount: number;
  /** Existing CouponRedemption count for this coupon, for this specific user. 0 for a guest (coupons require a real account — see CouponRedemption.userId's own non-null schema column). */
  userRedemptionCount: number;
  lines: CouponLineInput[];
}

export interface CouponEligibilityResult {
  ok: boolean;
  reason?: string;
  /** Only the lines this coupon's discount actually applies to — empty when !ok. */
  eligibleLines: CouponLineInput[];
  eligibleLineTotalPaise: number;
}

/**
 * Pure, dependency-free (week2 (1).md §9's own flow: "Validate coupon ->
 * Determine eligible items"). Every check that can independently reject a
 * coupon runs before eligible-line filtering, so a customer always gets the
 * single most relevant reason a coupon didn't apply, not a generic
 * "invalid coupon."
 *
 * Product/category applicability (§9's own bullet): a coupon with NEITHER
 * `productIds` NOR `categoryIds` set applies to the whole cart. One with
 * either restricts its discount to lines matching ANY listed product OR
 * ANY listed category — the same "independent facet, not a strict
 * intersection" reading Week 2 Day 1's size/color filters already
 * established for this catalogue, applied here to coupon scope instead.
 */
export function resolveCouponEligibility(coupon: CouponEntity, context: CouponEligibilityContext): CouponEligibilityResult {
  const reject = (reason: string): CouponEligibilityResult => ({ ok: false, reason, eligibleLines: [], eligibleLineTotalPaise: 0 });

  if (!coupon.isActive) {
    return reject("This coupon is no longer active");
  }
  if (context.now < coupon.validFrom || context.now > coupon.validTo) {
    return reject("This coupon has expired or isn't active yet");
  }
  if (coupon.minCartValuePaise !== null && context.cartSubtotalPaise < coupon.minCartValuePaise) {
    return reject(`Add more to your bag to use this coupon (minimum order value not met)`);
  }
  if (coupon.usageLimit !== null && context.globalRedemptionCount >= coupon.usageLimit) {
    return reject("This coupon has reached its usage limit");
  }
  if (coupon.perUserLimit !== null && context.userRedemptionCount >= coupon.perUserLimit) {
    return reject("You've already used this coupon the maximum number of times");
  }

  const hasRestriction = coupon.productIds.length > 0 || coupon.categoryIds.length > 0;
  const eligibleLines = hasRestriction
    ? context.lines.filter((line) => coupon.productIds.includes(line.productId) || coupon.categoryIds.includes(line.categoryId))
    : context.lines;

  if (eligibleLines.length === 0) {
    return reject("This coupon doesn't apply to any items in your bag");
  }

  return {
    ok: true,
    eligibleLines,
    eligibleLineTotalPaise: eligibleLines.reduce((sum, line) => sum + line.lineTotalPaise, 0),
  };
}
