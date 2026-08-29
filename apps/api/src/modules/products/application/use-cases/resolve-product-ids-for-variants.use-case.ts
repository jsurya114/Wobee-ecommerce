import type { ProductRepositoryPort } from "../ports/product-repository.port";

/**
 * Exported from products.module.ts for cross-module use (Week 2 Day 8 Part
 * 2, week2 (1).md §12) — `home`'s Best Sellers rail calls this to translate
 * the variant-level sales aggregate `orders` returns into the product ids
 * GetProductsByIdsUseCase needs, instead of `home` (or `orders`) reaching
 * into product_variants itself (ADR-010).
 */
export class ResolveProductIdsForVariantsUseCase {
  constructor(private readonly productRepository: ProductRepositoryPort) {}

  execute(variantIds: string[]): Promise<Map<string, string>> {
    return this.productRepository.findProductIdsForVariantIds(variantIds);
  }
}
