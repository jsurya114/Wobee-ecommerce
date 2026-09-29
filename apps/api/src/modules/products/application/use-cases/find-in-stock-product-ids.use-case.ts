import type { InventoryReaderPort } from "../ports/inventory-reader.port";
import type { ProductRepositoryPort } from "../ports/product-repository.port";

/**
 * Every product id that is currently in stock (2026-09-30): at least one
 * ACTIVE variant with live available stock (`quantityAvailable -
 * quantityReserved > 0`, summed across warehouses) — the exact rule the
 * storefront listing's in-stock filter applies in SQL, so "sold out" means
 * the same thing on the shop, the homepage and the wishlist. Read live on
 * every call, never cached (DEVELOPMENT_RULES.md #1).
 */
export class FindInStockProductIdsUseCase {
  constructor(
    private readonly inventoryReader: InventoryReaderPort,
    private readonly productRepository: ProductRepositoryPort,
  ) {}

  async execute(): Promise<Set<string>> {
    const inStockVariantIds = await this.inventoryReader.findInStockVariantIds();
    return this.productRepository.findProductIdsWithActiveVariants(inStockVariantIds);
  }
}
