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

/** Narrow port for this module's one dependency on `offers` (Phase 2, 2026-09-14) — same DIP rationale as pricing-reader.port.ts. */
export interface OfferReaderPort {
  resolveMany(inputs: OfferResolutionInput[]): Promise<ResolvedOfferPriceView[]>;
}
