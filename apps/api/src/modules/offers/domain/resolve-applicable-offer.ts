import { calculateOfferDiscount } from "./calculate-offer-discount";
import type { OfferForResolution } from "./entities/offer.entity";

const SCOPE_SPECIFICITY: Record<OfferForResolution["scope"], number> = {
  PRODUCTS: 3,
  CATEGORY: 2,
  ALL_PRODUCTS: 1,
};

export interface ProductForOfferMatch {
  productId: string;
  categoryId: string;
}

/**
 * Pure, dependency-free (mirrors resolveCouponEligibility's own posture).
 * `candidates` is every currently-active, in-schedule offer (already
 * filtered by `isOfferActive` one call up — this function does no time
 * checks itself) — this is what decides which of those actually TARGETS
 * this product, and picks exactly ONE winner when more than one does.
 *
 * At most one automatic offer ever applies to a product line (spec's own
 * "do not silently stack Offer A + Offer B + Offer C" rule). Precedence,
 * documented here since this is the one place it's decided:
 *   1. More specific scope wins: PRODUCTS > CATEGORY > ALL_PRODUCTS.
 *   2. Same scope: higher `priority` wins.
 *   3. Still tied: the offer giving the customer the GREATEST discount
 *      wins (computed against `basePricePaise` — the only point this
 *      function needs a price at all).
 *   4. Still tied (identical discount too): the offer with the
 *      lexicographically smaller `id` wins — a fixed, deterministic,
 *      stable tie-breaker so the result never depends on array/DB order.
 */
export function resolveApplicableOffer(
  candidates: OfferForResolution[],
  product: ProductForOfferMatch,
  basePricePaise: number,
): OfferForResolution | null {
  const matching = candidates.filter((offer) => matchesProduct(offer, product));
  if (matching.length === 0) return null;
  if (matching.length === 1) return matching[0]!;

  const sorted = [...matching].sort((a, b) => {
    const specificityDiff = SCOPE_SPECIFICITY[b.scope] - SCOPE_SPECIFICITY[a.scope];
    if (specificityDiff !== 0) return specificityDiff;

    const priorityDiff = b.priority - a.priority;
    if (priorityDiff !== 0) return priorityDiff;

    const discountDiff = calculateOfferDiscount(b, basePricePaise) - calculateOfferDiscount(a, basePricePaise);
    if (discountDiff !== 0) return discountDiff;

    return a.id.localeCompare(b.id);
  });

  return sorted[0]!;
}

function matchesProduct(offer: OfferForResolution, product: ProductForOfferMatch): boolean {
  switch (offer.scope) {
    case "ALL_PRODUCTS":
      return true;
    case "CATEGORY":
      return offer.categoryId === product.categoryId;
    case "PRODUCTS":
      return offer.productIds.includes(product.productId);
  }
}
