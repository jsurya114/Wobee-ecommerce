import type { ProductSummaryEntity } from "../../domain/entities/product.entity";
import type { InventoryReaderPort } from "../ports/inventory-reader.port";
import type { OfferReaderPort } from "../ports/offer-reader.port";
import type { PricingReaderPort } from "../ports/pricing-reader.port";
import type { ProductRepositoryPort } from "../ports/product-repository.port";
import { resolveFromPricing } from "./list-products.use-case";

export interface GroupProductsByOfferInput {
  limitPerOffer: number;
  inStockOnly?: boolean;
}

/**
 * Homepage "campaign section per active Offer" (offer merchandising pass,
 * 2026-09-15) — for every currently-active offer, its top `limitPerOffer`
 * eligible products, ranked cheapest-effective-price first. "Eligible" means
 * THIS offer is the one that actually wins precedence for that product
 * (never a product listed under an offer that doesn't really apply to it —
 * see `ProductRepositoryPort.findTopProductsPerOffer`'s own doc comment,
 * which resolves this the SAME way `onOffer`/effective-price sort already
 * do, not a second offer-matching rule).
 *
 * ONE ranked SQL query (a window function) regardless of how many offers are
 * active — never one query per offer (explicitly banned by the storefront
 * Offer-merchandising spec) and never "fetch every product, group in Node."
 * Hydration reuses `findByIds` + `resolveFromPricing` — the EXACT same
 * batched pricing/offer-resolution path `GetProductsByIdsUseCase` and
 * `ListProductsUseCase` already use, so a product's price/badge here can
 * never disagree with its PLP/PDP/cart presentation (spec's own "one Offer
 * eligibility definition everywhere" requirement).
 *
 * Returns a Map keyed by offer id; an offer with zero matching products is
 * simply absent from the map — `GetHomePageUseCase` (the caller) decides
 * whether/how to render that (it doesn't — the section is just omitted),
 * never this layer.
 */
export class GroupProductsByOfferUseCase {
  constructor(
    private readonly productRepository: ProductRepositoryPort,
    private readonly inventoryReader: InventoryReaderPort,
    private readonly pricingReader: PricingReaderPort,
    private readonly offerReader: OfferReaderPort,
  ) {}

  async execute(input: GroupProductsByOfferInput): Promise<Map<string, ProductSummaryEntity[]>> {
    let inStockVariantIds: string[] | undefined;
    if (input.inStockOnly) {
      inStockVariantIds = await this.inventoryReader.findInStockVariantIds();
      if (inStockVariantIds.length === 0) return new Map();
    }

    const pairs = await this.productRepository.findTopProductsPerOffer({ limit: input.limitPerOffer, inStockVariantIds });
    if (pairs.length === 0) return new Map();

    const uniqueProductIds = Array.from(new Set(pairs.map((pair) => pair.productId)));
    const rows = await this.productRepository.findByIds(uniqueProductIds);
    const resolved = await resolveFromPricing(rows, this.pricingReader, this.offerReader);
    const resolvedById = new Map(resolved.map((product) => [product.id, product]));

    const grouped = new Map<string, ProductSummaryEntity[]>();
    for (const pair of pairs) {
      const product = resolvedById.get(pair.productId);
      if (!product) continue; // Deleted/deactivated between the two queries — skip, don't fail the whole section.
      const list = grouped.get(pair.offerId) ?? [];
      list.push(product);
      grouped.set(pair.offerId, list);
    }
    return grouped;
  }
}
