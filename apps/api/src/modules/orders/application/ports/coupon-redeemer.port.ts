export interface CouponEligibleLine {
  variantId: string;
  productId: string;
  categoryId: string;
  lineTotalPaise: number;
}

export interface ValidateAndLockCouponResult {
  couponId: string;
  discountPaise: number;
  eligibleLines: CouponEligibleLine[];
}

/**
 * Narrow port onto `coupons` (week2 (1).md §9) — split into two calls for
 * the same reason RedeemCouponUseCase itself is split (see that use-case's
 * own doc comment): `validateAndLock` runs before the Order row exists,
 * `finalize` runs after, both inside the SAME checkout transaction.
 */
export interface CouponRedeemerPort {
  validateAndLock(
    input: { code: string; userId: string; cartSubtotalPaise: number; lines: CouponEligibleLine[] },
    tx: unknown,
  ): Promise<ValidateAndLockCouponResult>;
  finalize(couponId: string, userId: string, orderId: string, tx: unknown): Promise<void>;
}
