import type { OfferDiscountType, OfferScope } from "@woobe/types";

export interface OfferInputForValidation {
  discountType: OfferDiscountType;
  discountValue: number;
  scope: OfferScope;
  categoryId: string | null;
  productIds: string[];
  startsAt: Date;
  endsAt: Date;
}

/**
 * Pure domain function (ARCHITECTURE.md §3.1) — mirrors
 * `validateCouponInput` (coupons module) exactly: the single place every
 * cross-field Offer-shape rule lives, so `CreateOfferUseCase` and
 * `UpdateOfferUseCase` both call it against the FINAL, fully-resolved
 * values (update merges the patch onto the existing row first) rather than
 * duplicating these checks per-schema. Scope/target consistency (spec's
 * "invalid scope/target combinations") is a cross-field rule too, so it
 * lives here rather than as a DB CHECK — same precedent Coupon's own
 * product/category-applicability shape already established (a coupon's
 * CouponProduct/CouponCategory rows are validated by their own use-case,
 * never a DB constraint spanning two tables).
 */
export function validateOfferInput(input: OfferInputForValidation): string | null {
  if (input.discountType === "PERCENTAGE" && (input.discountValue < 1 || input.discountValue > 100)) {
    return "Percentage value must be between 1 and 100";
  }
  if (input.discountType === "FIXED_AMOUNT" && input.discountValue <= 0) {
    return "Fixed amount value must be a positive amount";
  }
  if (input.endsAt <= input.startsAt) {
    return "End date must be after the start date";
  }

  if (input.scope === "CATEGORY" && !input.categoryId) {
    return "Choose a category for a category-scoped offer";
  }
  if (input.scope !== "CATEGORY" && input.categoryId) {
    return "A category can only be set for a category-scoped offer";
  }
  if (input.scope === "PRODUCTS" && input.productIds.length === 0) {
    return "Choose at least one product for a product-scoped offer";
  }
  if (input.scope !== "PRODUCTS" && input.productIds.length > 0) {
    return "Products can only be set for a product-scoped offer";
  }

  return null;
}
