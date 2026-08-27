import type { ProductSort } from "@woobe/validation";
import type { ProductDetailEntity, ProductSummaryEntity, ProductVariantEntity } from "../../domain/entities/product.entity";

export interface ListProductsFilter {
  categoryId?: string;
  collectionId?: string;
  /** Matched against Product.name — see ListProductsUseCase's own comment on ILIKE + the pg_trgm index. */
  search?: string;
  /** Independent facets — OR within each, AND across (see ListProductsUseCase). */
  sizes?: string[];
  colors?: string[];
  /**
   * Present only when the caller asked for in-stock-only — the exact set of
   * currently-in-stock variant ids, resolved live from `inventory` one call
   * up (ListProductsUseCase), never from a cached flag on Product/Variant.
   * An empty array is a real, valid "nothing is in stock right now" state —
   * the use-case short-circuits before even reaching this repository in
   * that case (see its own comment), so this repository never has to treat
   * `[]` specially.
   */
  inStockVariantIds?: string[];
  minPricePaise?: number;
  maxPricePaise?: number;
  sort: ProductSort;
  page: number;
  limit: number;
}

export interface ListProductsResult {
  products: ProductSummaryEntity[];
  total: number;
}

/**
 * application depends on this interface, not on Prisma directly — the
 * infrastructure layer implements it (ARCHITECTURE.md §3.1).
 */
/** Used by the wishlist module (via this module's exported use-case, Week 2 Day 2) — unlike findMany/findBySlug, deliberately NOT `isActive`-filtered: a wishlisted product that later goes inactive still needs to show up (with isActive: false) rather than silently vanish from the view. */
export interface ProductSummaryWithStatus extends ProductSummaryEntity {
  isActive: boolean;
}

export interface ProductRepositoryPort {
  findMany(filter: ListProductsFilter): Promise<ListProductsResult>;
  findBySlug(slug: string): Promise<ProductDetailEntity | null>;
  /** Used by the cart module (via this module's exported use-case) to price/display cart lines without importing Prisma itself. */
  findVariantsByIds(variantIds: string[]): Promise<(ProductVariantEntity & { productId: string; productName: string; productSlug: string; image: string | null })[]>;
  findByIds(productIds: string[]): Promise<ProductSummaryWithStatus[]>;
}
