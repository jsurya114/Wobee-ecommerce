import type { OfferDiscountType, OfferScope } from "@woobe/types";

/**
 * Full shape, admin-facing. `categoryId` is set only when `scope ===
 * "CATEGORY"`; `productIds` is non-empty only when `scope === "PRODUCTS"` —
 * mirrors CouponEntity's own "empty means no restriction" convention,
 * adapted to Offer's exactly-one-scope shape (an Offer, unlike a Coupon,
 * always has exactly one targeting rule, never "no restriction AND a
 * product list").
 */
export interface OfferEntity {
  id: string;
  name: string;
  description: string | null;
  discountType: OfferDiscountType;
  /** Percent (1-100) for PERCENTAGE, paise for FIXED_AMOUNT — see schema.prisma's own comment on this dual meaning. */
  discountValue: number;
  scope: OfferScope;
  categoryId: string | null;
  productIds: string[];
  priority: number;
  startsAt: Date;
  endsAt: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * What ResolveApplicableOffersUseCase needs to MATCH an offer against a
 * product and CALCULATE its discount — a lean projection of OfferEntity,
 * not the full admin shape (no `description`/`createdAt`/`updatedAt`, which
 * matching/pricing never reads). Same "lean projection for the hot path"
 * precedent as ProductSummaryProjection.
 */
export interface OfferForResolution {
  id: string;
  name: string;
  discountType: OfferDiscountType;
  discountValue: number;
  scope: OfferScope;
  categoryId: string | null;
  productIds: string[];
  priority: number;
}

/** Lightweight shape for the homepage offer strip — see ListActiveOffersForStripUseCase. */
export interface OfferStripEntity {
  id: string;
  name: string;
  discountType: OfferDiscountType;
  discountValue: number;
  scope: OfferScope;
}
