import type { ProductSort } from "@woobe/validation";
import { NotFoundError } from "../../../../shared/errors";
import type { ProductSummaryEntity } from "../../domain/entities/product.entity";
import type { CategoryReaderPort } from "../ports/category-reader.port";
import type { CollectionReaderPort } from "../ports/collection-reader.port";
import type { InventoryReaderPort } from "../ports/inventory-reader.port";
import type { PricingReaderPort } from "../ports/pricing-reader.port";
import type { ProductRepositoryPort, ProductSummaryProjection } from "../ports/product-repository.port";

export interface ListProductsInput {
  categorySlug?: string;
  collectionSlug?: string;
  q?: string;
  sizes?: string[];
  colors?: string[];
  inStockOnly?: boolean;
  minPricePaise?: number;
  maxPricePaise?: number;
  sort: ProductSort;
  page: number;
  limit: number;
}

export interface ListProductsResult {
  products: ProductSummaryEntity[];
  page: number;
  limit: number;
  total: number;
}

/**
 * Catalogue discovery (Week 2 Day 1, ADR-012): search + category/collection
 * filtering + variant-level size/color facets + live availability + price
 * range + sort, all server-side, combinable, and bounded (validate
 * middleware already caps page size at 50 — see productListQuerySchema).
 *
 * Size/color are treated as INDEPENDENT facets, not a single combined
 * variant match: "size=M&color=Red" returns products that have *a* size-M
 * variant AND *a* color-Red variant, not necessarily the same variant. This
 * is the common storefront-filter convention (a product "comes in red" and
 * "comes in M" are separate facts to a shopper narrowing a grid) and is
 * simpler to reason about/test than a combined-variant match; revisit only
 * if real UX feedback asks for the stricter behavior.
 */
export class ListProductsUseCase {
  constructor(
    private readonly productRepository: ProductRepositoryPort,
    private readonly categoryReader: CategoryReaderPort,
    private readonly collectionReader: CollectionReaderPort,
    private readonly inventoryReader: InventoryReaderPort,
    private readonly pricingReader: PricingReaderPort,
  ) {}

  async execute(input: ListProductsInput): Promise<ListProductsResult> {
    let categoryId: string | undefined;
    if (input.categorySlug) {
      const resolved = await this.categoryReader.findIdBySlug(input.categorySlug);
      if (!resolved) {
        throw new NotFoundError(`Unknown category: ${input.categorySlug}`);
      }
      categoryId = resolved;
    }

    let collectionId: string | undefined;
    if (input.collectionSlug) {
      const resolved = await this.collectionReader.findIdBySlug(input.collectionSlug);
      if (!resolved) {
        throw new NotFoundError(`Unknown collection: ${input.collectionSlug}`);
      }
      collectionId = resolved;
    }

    // Live availability filter (DEVELOPMENT_RULES.md #1 — never a cached
    // in-stock flag). Resolved once, up front, catalogue-wide — see
    // InventoryReaderPort's own doc comment for why this is fine at this
    // catalogue's current scale. Nothing in stock at all is a real, valid
    // empty-result state — short-circuit before the products query rather
    // than asking Postgres to match `id IN ()`.
    let inStockVariantIds: string[] | undefined;
    if (input.inStockOnly) {
      inStockVariantIds = await this.inventoryReader.findInStockVariantIds();
      if (inStockVariantIds.length === 0) {
        return { products: [], page: input.page, limit: input.limit, total: 0 };
      }
    }

    const { products, total } = await this.productRepository.findMany({
      categoryId,
      collectionId,
      search: input.q,
      sizes: input.sizes,
      colors: input.colors,
      inStockVariantIds,
      minPricePaise: input.minPricePaise,
      maxPricePaise: input.maxPricePaise,
      sort: input.sort,
      page: input.page,
      limit: input.limit,
    });

    return {
      products: await resolveFromPricing(products, this.pricingReader),
      page: input.page,
      limit: input.limit,
      total,
    };
  }
}

/**
 * Turns each projection's raw representative variant into the resolved
 * `fromWeightGrams` / `fromRatePerKgPaise` the card displays. One batched
 * pricing call for the whole page (the pricing use-case reads the admin
 * default rate exactly once) — no N+1, and the shown price stays
 * `minPricePaiseCache` (ADR-012); this only adds the rate as a trust signal.
 * Shared by `GetProductsByIdsUseCase` for the id-based (home / wishlist) path.
 */
export async function resolveFromPricing(
  projections: ProductSummaryProjection[],
  pricingReader: PricingReaderPort,
): Promise<ProductSummaryEntity[]> {
  const withVariant = projections
    .map((p, index) => ({ index, variant: p.representativeVariant }))
    .filter((entry): entry is { index: number; variant: NonNullable<ProductSummaryProjection["representativeVariant"]> } => entry.variant !== null);

  const rates = withVariant.length
    ? await pricingReader.calculateMany(
        withVariant.map((entry) => ({
          weightGrams: entry.variant.weightGrams,
          ratePerKgOverridePaise: entry.variant.ratePerKgOverridePaise,
        })),
      )
    : [];

  const rateByIndex = new Map<number, number>();
  withVariant.forEach((entry, i) => rateByIndex.set(entry.index, rates[i]!.ratePerKgPaise));

  return projections.map((projection, index) => {
    const { representativeVariant, ...rest } = projection;
    return {
      ...rest,
      fromWeightGrams: representativeVariant?.weightGrams ?? null,
      fromRatePerKgPaise: rateByIndex.get(index) ?? null,
    };
  });
}
