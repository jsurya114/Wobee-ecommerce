import type { ProductSort } from "@woobe/validation";
import type {
  AdminProductDetailEntity,
  AdminProductImageEntity,
  AdminProductSummaryEntity,
  AdminProductVariantEntity,
  ProductDetailEntity,
  ProductSummaryEntity,
  ProductVariantEntity,
} from "../../domain/entities/product.entity";

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

export interface ListProductsAdminFilter {
  search?: string;
  categoryId?: string;
  isActive?: boolean;
  page: number;
  pageSize: number;
}

export interface ListProductsAdminResult {
  items: AdminProductSummaryEntity[];
  total: number;
}

export interface CreateProductInput {
  name: string;
  slug: string;
  description?: string;
  brand?: string;
  categoryId: string;
  metaTitle?: string;
  metaDescription?: string;
}

export interface UpdateProductInput {
  name?: string;
  slug?: string;
  description?: string | null;
  brand?: string | null;
  categoryId?: string;
  metaTitle?: string | null;
  metaDescription?: string | null;
}

export interface CreateVariantInput {
  productId: string;
  sku: string;
  color: string;
  size: string;
  weightGrams: number;
  ratePerKgOverridePaise?: number | null;
  fabric?: string | null;
  fit?: string | null;
  measurements?: string | null;
  /** Pre-computed by the use-case (PricingReaderPort) — the repository never derives price itself, same "repository doesn't own business rules" boundary every other module's repository respects. */
  effectivePricePaiseCache: number;
}

export interface UpdateVariantInput {
  sku?: string;
  color?: string;
  size?: string;
  weightGrams?: number;
  ratePerKgOverridePaise?: number | null;
  fabric?: string | null;
  fit?: string | null;
  measurements?: string | null;
  /** Only set when weight/rate actually changed — see UpdateProductVariantUseCase's own comment. */
  effectivePricePaiseCache?: number;
}

export interface AddProductImageInput {
  url: string;
  altText: string;
}

export interface ProductRepositoryPort {
  findMany(filter: ListProductsFilter): Promise<ListProductsResult>;
  findBySlug(slug: string): Promise<ProductDetailEntity | null>;
  /** Used by the cart module (via this module's exported use-case) to price/display cart lines without importing Prisma itself. */
  findVariantsByIds(
    variantIds: string[],
  ): Promise<
    (ProductVariantEntity & { productId: string; categoryId: string; productName: string; productSlug: string; image: string | null })[]
  >;
  findByIds(productIds: string[]): Promise<ProductSummaryWithStatus[]>;

  // ── Week 2 Day 7 admin surface (week2 (1).md §16) ──
  findAllForAdmin(filter: ListProductsAdminFilter): Promise<ListProductsAdminResult>;
  findByIdForAdmin(productId: string): Promise<AdminProductDetailEntity | null>;
  createProduct(input: CreateProductInput): Promise<AdminProductDetailEntity>;
  updateProduct(productId: string, input: UpdateProductInput): Promise<AdminProductDetailEntity>;
  setProductActive(productId: string, isActive: boolean): Promise<AdminProductDetailEntity>;

  createVariant(input: CreateVariantInput): Promise<AdminProductVariantEntity>;
  updateVariant(variantId: string, input: UpdateVariantInput): Promise<AdminProductVariantEntity>;
  setVariantActive(variantId: string, isActive: boolean): Promise<AdminProductVariantEntity>;
  findVariantProductId(variantId: string): Promise<string | null>;
  /** One variant, with its owning productId — used by UpdateProductVariantUseCase to reprice against the CURRENT weight/rate when only one of the two is part of a given edit. */
  findVariantForAdmin(variantId: string): Promise<(AdminProductVariantEntity & { productId: string }) | null>;
  /** Recomputes `Product.minPricePaiseCache` from its currently-active variants (or 0 if none) — called after any variant create/update/activation-change, since that cache drives the customer-facing listing's price display and sort. */
  recomputeMinPrice(productId: string): Promise<void>;

  addImage(productId: string, input: AddProductImageInput): Promise<AdminProductImageEntity>;
  removeImage(productId: string, imageId: string): Promise<void>;
  listImageIds(productId: string): Promise<string[]>;
  reorderImages(productId: string, orderedImageIds: string[]): Promise<void>;
}
