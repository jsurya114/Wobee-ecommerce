import { bumpCatalogCacheVersion, cacheAside } from "../../../../shared/cache/catalog-cache";
import type {
  AddProductImageInput,
  CreateProductInput,
  CreateVariantInput,
  ListProductsAdminFilter,
  ListProductsAdminResult,
  ListProductsFilter,
  ListProductsResult,
  ProductRepositoryPort,
  ProductSummaryProjection,
  ProductSummaryProjectionWithStatus,
  UpdateProductInput,
  UpdateVariantInput,
} from "../../application/ports/product-repository.port";
import type {
  AdminProductDetailEntity,
  AdminProductImageEntity,
  AdminProductVariantEntity,
  ProductDetailEntity,
  ProductSuggestionEntity,
} from "../../domain/entities/product.entity";

const LIST_TTL_SECONDS = 60;
const DETAIL_TTL_SECONDS = 120;
const RELATED_TTL_SECONDS = 120;

/** Order-independent so `size=M,L` and `size=L,M` hit the same cache entry. */
function joinSorted(values: string[] | undefined): string {
  if (!values || values.length === 0) return "_";
  return [...values].sort().join(",");
}

function buildListKey(filter: ListProductsFilter): string {
  return [
    "products:list",
    filter.categoryId ?? "_",
    filter.collectionId ?? "_",
    filter.search ?? "_",
    joinSorted(filter.sizes),
    joinSorted(filter.colors),
    filter.minPricePaise ?? "_",
    filter.maxPricePaise ?? "_",
    filter.sort,
    filter.page,
    filter.limit,
  ].join(":");
}

/**
 * Read-through cache decorator (ADR-017) around the real `ProductRepository`
 * — implements the exact same port, so no use-case/controller changes
 * anywhere. Only the customer-facing, non-live-data reads are cached; every
 * admin method and every live-inventory/live-pricing read stays a direct
 * passthrough to the inner repository, unchanged and always live.
 *
 * `findMany` is deliberately NOT cached when `filter.inStockVariantIds` is
 * present (`inStockOnly=true`) — that set is resolved live from `inventory`
 * one call up (`ListProductsUseCase`) and changes on every stock movement,
 * so caching against it would be both the closest thing here to caching
 * inventory and a near-zero cache-hit-rate key shape anyway.
 *
 * Every write method that can change what a cached read would show bumps
 * the shared catalog cache version (see `bumpCatalogCacheVersion`'s own
 * doc comment for why this is a deliberately coarse, whole-namespace bump
 * rather than per-entity invalidation) — AFTER the inner write succeeds,
 * so a failed write never bumps the version, and a version-bump failure
 * (logged, swallowed) never undoes an already-committed write.
 */
export class CachedProductRepository implements ProductRepositoryPort {
  constructor(private readonly inner: ProductRepositoryPort) {}

  findMany(filter: ListProductsFilter): Promise<ListProductsResult> {
    if (filter.inStockVariantIds) return this.inner.findMany(filter);
    return cacheAside(buildListKey(filter), LIST_TTL_SECONDS, () => this.inner.findMany(filter));
  }

  findBySlug(slug: string): Promise<ProductDetailEntity | null> {
    return cacheAside(`product:detail:${slug}`, DETAIL_TTL_SECONDS, () => this.inner.findBySlug(slug));
  }

  findRelatedProducts(params: { excludeProductId: string; categoryId: string; limit: number }): Promise<ProductSummaryProjection[]> {
    const key = `product:related:${params.categoryId}:${params.excludeProductId}:${params.limit}`;
    return cacheAside(key, RELATED_TTL_SECONDS, () => this.inner.findRelatedProducts(params));
  }

  // ── Live/internal reads — never cached, straight passthrough ──
  searchSuggestions(query: string, limit: number): Promise<ProductSuggestionEntity[]> {
    return this.inner.searchSuggestions(query, limit);
  }
  findVariantsByIds(variantIds: string[]): ReturnType<ProductRepositoryPort["findVariantsByIds"]> {
    return this.inner.findVariantsByIds(variantIds);
  }
  findProductPricingMode(productId: string): ReturnType<ProductRepositoryPort["findProductPricingMode"]> {
    return this.inner.findProductPricingMode(productId);
  }
  findByIds(productIds: string[]): Promise<ProductSummaryProjectionWithStatus[]> {
    return this.inner.findByIds(productIds);
  }
  findProductIdsForVariantIds(variantIds: string[]): Promise<Map<string, string>> {
    return this.inner.findProductIdsForVariantIds(variantIds);
  }
  findPrimaryImageUrlByCategoryIds(categoryIds: string[]): Promise<Map<string, string>> {
    return this.inner.findPrimaryImageUrlByCategoryIds(categoryIds);
  }
  findAllForAdmin(filter: ListProductsAdminFilter): Promise<ListProductsAdminResult> {
    return this.inner.findAllForAdmin(filter);
  }
  findByIdForAdmin(productId: string): Promise<AdminProductDetailEntity | null> {
    return this.inner.findByIdForAdmin(productId);
  }
  slugExists(slug: string, excludeProductId?: string): Promise<boolean> {
    return this.inner.slugExists(slug, excludeProductId);
  }
  skuExists(sku: string): Promise<boolean> {
    return this.inner.skuExists(sku);
  }
  findVariantProductId(variantId: string): Promise<string | null> {
    return this.inner.findVariantProductId(variantId);
  }
  findVariantForAdmin(variantId: string): ReturnType<ProductRepositoryPort["findVariantForAdmin"]> {
    return this.inner.findVariantForAdmin(variantId);
  }
  listImageIds(productId: string): Promise<string[]> {
    return this.inner.listImageIds(productId);
  }

  // ── Writes — passthrough, then bump the shared catalog cache version ──
  async createProduct(input: CreateProductInput): Promise<AdminProductDetailEntity> {
    const result = await this.inner.createProduct(input);
    await bumpCatalogCacheVersion();
    return result;
  }
  async updateProduct(productId: string, input: UpdateProductInput): Promise<AdminProductDetailEntity> {
    const result = await this.inner.updateProduct(productId, input);
    await bumpCatalogCacheVersion();
    return result;
  }
  async setProductActive(productId: string, isActive: boolean): Promise<AdminProductDetailEntity> {
    const result = await this.inner.setProductActive(productId, isActive);
    await bumpCatalogCacheVersion();
    return result;
  }
  async createVariant(input: CreateVariantInput): Promise<AdminProductVariantEntity> {
    const result = await this.inner.createVariant(input);
    await bumpCatalogCacheVersion();
    return result;
  }
  async updateVariant(variantId: string, input: UpdateVariantInput): Promise<AdminProductVariantEntity> {
    const result = await this.inner.updateVariant(variantId, input);
    await bumpCatalogCacheVersion();
    return result;
  }
  async setVariantActive(variantId: string, isActive: boolean): Promise<AdminProductVariantEntity> {
    const result = await this.inner.setVariantActive(variantId, isActive);
    await bumpCatalogCacheVersion();
    return result;
  }
  async recomputeMinPrice(productId: string): Promise<void> {
    await this.inner.recomputeMinPrice(productId);
    await bumpCatalogCacheVersion();
  }
  async addImage(productId: string, input: AddProductImageInput): Promise<AdminProductImageEntity> {
    const result = await this.inner.addImage(productId, input);
    await bumpCatalogCacheVersion();
    return result;
  }
  async removeImage(productId: string, imageId: string): Promise<void> {
    await this.inner.removeImage(productId, imageId);
    await bumpCatalogCacheVersion();
  }
  async reorderImages(productId: string, orderedImageIds: string[]): Promise<void> {
    await this.inner.reorderImages(productId, orderedImageIds);
    await bumpCatalogCacheVersion();
  }
}
