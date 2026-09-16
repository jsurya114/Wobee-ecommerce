import { calculateOfferDiscount } from "../../domain/calculate-offer-discount";
import type { OfferForResolution } from "../../domain/entities/offer.entity";
import { resolveApplicableOffer, type ProductForOfferMatch } from "../../domain/resolve-applicable-offer";
import type { OfferRepositoryPort } from "../ports/offer-repository.port";

export interface ResolveOfferInput extends ProductForOfferMatch {
  /** The base (pre-offer) price for this one product/line — resolved by the caller through the SAME pricing pipeline (CalculateEffectivePriceUseCase) every other path uses; this use-case never derives a price itself. */
  basePricePaise: number;
}

export interface AppliedOffer {
  offerId: string;
  name: string;
  discountType: OfferForResolution["discountType"];
  discountValue: number;
  /** The actual paise amount deducted from `basePricePaise` for this one unit. */
  discountPaise: number;
}

export interface ResolvedOfferPrice {
  /** `basePricePaise` minus `appliedOffer.discountPaise` — 0 discount (and this equal to basePricePaise) when no offer applies. */
  pricePaise: number;
  /** Null when no offer matched this product. */
  appliedOffer: AppliedOffer | null;
}

/**
 * The single path every other module goes through to resolve a product's
 * OFFER-adjusted price (DEVELOPMENT_RULES.md #1 — never trust the client;
 * §4 — one reusable pricing mechanism, not a formula duplicated per
 * caller). Exported from offers.module.ts for cross-module use (products'
 * PLP/PDP display, cart's live recalculation, checkout's authoritative
 * calculation) — those modules depend on this class, not on
 * OfferRepository/Prisma, same cross-module-port pattern
 * CalculateEffectivePriceUseCase (pricing module) already established for
 * exactly this shape of dependency.
 *
 * Batched (`executeMany`) fetches the full active-offer set with ONE
 * repository call regardless of how many products are being priced, then
 * matches every product against that same in-memory list — this is what
 * keeps offer resolution from becoming the N+1 query problem the spec
 * explicitly calls out (`findMany products -> query offers per product`).
 * The active-offer set is typically small (a real store runs a handful of
 * concurrent promotions, not thousands), so holding it in memory for one
 * batch is cheap; `resolveApplicableOffer`'s own matching/precedence logic
 * is O(offers) per product, done once per request, never once per product
 * against the database.
 */
export class ResolveApplicableOffersUseCase {
  constructor(private readonly offerRepository: OfferRepositoryPort) {}

  async executeMany(inputs: ResolveOfferInput[]): Promise<ResolvedOfferPrice[]> {
    if (inputs.length === 0) return [];
    const activeOffers = await this.offerRepository.findActiveForResolution(new Date());
    return inputs.map((input) => this.resolveOne(activeOffers, input));
  }

  async execute(input: ResolveOfferInput): Promise<ResolvedOfferPrice> {
    const [result] = await this.executeMany([input]);
    return result!;
  }

  private resolveOne(activeOffers: OfferForResolution[], input: ResolveOfferInput): ResolvedOfferPrice {
    const winner = resolveApplicableOffer(activeOffers, { productId: input.productId, categoryId: input.categoryId }, input.basePricePaise);
    if (!winner) {
      return { pricePaise: input.basePricePaise, appliedOffer: null };
    }

    const discountPaise = calculateOfferDiscount(winner, input.basePricePaise);
    return {
      // Never negative — calculateOfferDiscount already clamps discountPaise <= basePricePaise.
      pricePaise: input.basePricePaise - discountPaise,
      appliedOffer: { offerId: winner.id, name: winner.name, discountType: winner.discountType, discountValue: winner.discountValue, discountPaise },
    };
  }
}
