/**
 * The one place "20% OFF" vs "₹300 OFF" text is built (offer-filtering pass,
 * 2026-09-15) — previously duplicated inline in ProductCard and
 * ProductPurchasePanel. `discountValue` is paise for FIXED_AMOUNT (same
 * dual-meaning convention as the backend's own OfferEntity.discountValue),
 * rupees-displayed here via a straight /100 round, matching every other
 * paise→₹ display in this app.
 */
export function formatOfferBadgeLabel(offer: { discountType: "PERCENTAGE" | "FIXED_AMOUNT"; discountValue: number }): string {
  return offer.discountType === "PERCENTAGE" ? `${offer.discountValue}% OFF` : `₹${Math.round(offer.discountValue / 100)} OFF`;
}
