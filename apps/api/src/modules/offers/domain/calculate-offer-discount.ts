import type { OfferForResolution } from "./entities/offer.entity";

/**
 * Pure, dependency-free — mirrors `calculateCouponDiscount` exactly
 * (coupons module), same rules applied to an offer instead: PERCENTAGE
 * rounds down (never charges the customer more than the stated percentage
 * would produce), and the result can never exceed `basePricePaise` itself
 * regardless of type (a FIXED_AMOUNT offer larger than the item's own price
 * clamps to the item's full price, never a negative price — "discounts
 * must be prevented from producing negative prices," per the spec).
 */
export function calculateOfferDiscount(offer: Pick<OfferForResolution, "discountType" | "discountValue">, basePricePaise: number): number {
  const discountPaise = offer.discountType === "PERCENTAGE" ? Math.floor((basePricePaise * offer.discountValue) / 100) : offer.discountValue;

  return Math.min(discountPaise, basePricePaise);
}
