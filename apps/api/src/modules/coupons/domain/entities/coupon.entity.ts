export type CouponType = "PERCENTAGE" | "FLAT";

export interface CouponEntity {
  id: string;
  code: string;
  type: CouponType;
  /** Percent (1-100) for PERCENTAGE, paise for FLAT — matches Coupon.value's own dual meaning in the schema (ADR pattern already used for CouponType). */
  value: number;
  minCartValuePaise: number | null;
  maxDiscountPaise: number | null;
  usageLimit: number | null;
  perUserLimit: number | null;
  validFrom: Date;
  validTo: Date;
  isActive: boolean;
  /** Empty arrays mean "no restriction" (cart-wide) — see resolveCouponEligibility's own doc comment. */
  productIds: string[];
  categoryIds: string[];
}
