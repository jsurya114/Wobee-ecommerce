import type { ProductRepositoryPort } from "../ports/product-repository.port";

/**
 * Exported from products.module.ts for cross-module use (merchandising
 * logic corrections, 2026-09-06) — `home`'s "Shop your size" rail calls
 * this instead of reaching into ProductVariant itself (ADR-010). See
 * `countActiveProductsBySize`'s own doc comment on `ProductRepositoryPort`
 * for exactly what's counted.
 */
export class CountActiveProductsBySizeUseCase {
  constructor(private readonly productRepository: ProductRepositoryPort) {}

  execute(sizes: string[]): Promise<Map<string, number>> {
    return this.productRepository.countActiveProductsBySize(sizes);
  }
}
