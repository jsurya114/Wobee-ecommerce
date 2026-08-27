import type { ProductRepositoryPort, ProductSummaryWithStatus } from "../ports/product-repository.port";

/**
 * Exported from products.module.ts for cross-module use — the wishlist
 * module (Week 2 Day 2) calls this instead of importing Prisma's Product
 * model itself (ADR-010: Product belongs to `products`, not `wishlist`).
 * Deliberately not `isActive`-filtered (unlike GetProductBySlugUseCase) —
 * see ProductSummaryWithStatus's own doc comment.
 */
export class GetProductsByIdsUseCase {
  constructor(private readonly productRepository: ProductRepositoryPort) {}

  async execute(productIds: string[]): Promise<Map<string, ProductSummaryWithStatus>> {
    if (productIds.length === 0) return new Map();
    const rows = await this.productRepository.findByIds(productIds);
    return new Map(rows.map((row) => [row.id, row]));
  }
}
