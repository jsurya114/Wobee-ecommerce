import type { ProductDetailEntity, ProductSummaryEntity, ProductVariantEntity } from "../../domain/entities/product.entity";

export interface ListProductsFilter {
  categoryId?: string;
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
export interface ProductRepositoryPort {
  findMany(filter: ListProductsFilter): Promise<ListProductsResult>;
  findBySlug(slug: string): Promise<ProductDetailEntity | null>;
  /** Used by the cart module (via this module's exported use-case) to price/display cart lines without importing Prisma itself. */
  findVariantsByIds(variantIds: string[]): Promise<(ProductVariantEntity & { productId: string; productName: string; productSlug: string; image: string | null })[]>;
}
