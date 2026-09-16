import type { OfferDiscountType } from "@woobe/types";

export interface OfferResolutionInput {
  productId: string;
  categoryId: string;
  basePricePaise: number;
}

export interface AppliedOfferView {
  offerId: string;
  name: string;
  discountType: OfferDiscountType;
  discountValue: number;
  discountPaise: number;
}

export interface ResolvedOfferPriceView {
  pricePaise: number;
  appliedOffer: AppliedOfferView | null;
}

/**
 * Narrow port for this module's one dependency on `offers` (Phase 2,
 * 2026-09-14) — decouples products' application layer from offers'
 * concrete use-case class (DIP), same pattern PricingReaderPort already
 * establishes for this module's dependency on `pricing`. The composition
 * root wires it with a one-line pass-through adapter.
 */
export interface OfferReaderPort {
  resolveMany(inputs: OfferResolutionInput[]): Promise<ResolvedOfferPriceView[]>;
}
