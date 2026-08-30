import type { ProductRepositoryPort } from "../ports/product-repository.port";

/**
 * Redesign O-3 — a representative product image per category id, for the
 * homepage's compact category rail. Exported from products.module.ts and
 * composed by the `home` module (not by `categories`, which would close a
 * cycle: `products` already depends on `categories`). Categories with no
 * imaged active product are simply absent from the returned map.
 */
export class GetCategoryImagesUseCase {
  constructor(private readonly productRepository: ProductRepositoryPort) {}

  execute(categoryIds: string[]): Promise<Map<string, string>> {
    return this.productRepository.findPrimaryImageUrlByCategoryIds(categoryIds);
  }
}
