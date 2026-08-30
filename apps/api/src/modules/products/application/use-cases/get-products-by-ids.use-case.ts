import type { PricingReaderPort } from "../ports/pricing-reader.port";
import type { ProductRepositoryPort, ProductSummaryWithStatus } from "../ports/product-repository.port";
import { resolveFromPricing } from "./list-products.use-case";

/**
 * Exported from products.module.ts for cross-module use — the wishlist
 * module (Week 2 Day 2) and `home`'s Best Sellers / Customer Reviews rails
 * call this instead of importing Prisma's Product model itself (ADR-010:
 * Product belongs to `products`). Deliberately not `isActive`-filtered
 * (unlike GetProductBySlugUseCase) — see ProductSummaryWithStatus's own
 * doc comment. Resolves the `from*` weight/rate display fields the same
 * batched way the catalogue listing does.
 */
export class GetProductsByIdsUseCase {
  constructor(
    private readonly productRepository: ProductRepositoryPort,
    private readonly pricingReader: PricingReaderPort,
  ) {}

  async execute(productIds: string[]): Promise<Map<string, ProductSummaryWithStatus>> {
    if (productIds.length === 0) return new Map();
    const rows = await this.productRepository.findByIds(productIds);
    const resolved = await resolveFromPricing(rows, this.pricingReader);
    return new Map(resolved.map((product, index) => [product.id, { ...product, isActive: rows[index]!.isActive }]));
  }
}
