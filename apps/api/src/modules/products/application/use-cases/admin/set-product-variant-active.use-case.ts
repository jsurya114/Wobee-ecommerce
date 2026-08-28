import { NotFoundError } from "../../../../../shared/errors";
import type { AdminProductVariantEntity } from "../../../domain/entities/product.entity";
import type { ProductRepositoryPort } from "../../ports/product-repository.port";

/** "Deactivate" a single variant (week2 (1).md §16) without touching the rest of the product — an inactive variant drops out of the customer-facing PDP's buyable options immediately. Recomputes `Product.minPricePaiseCache` since deactivating the cheapest variant should stop it counting toward the listing's displayed "from" price. */
export class SetProductVariantActiveUseCase {
  constructor(private readonly productRepository: ProductRepositoryPort) {}

  async execute(variantId: string, isActive: boolean): Promise<AdminProductVariantEntity> {
    const updated = await this.productRepository.setVariantActive(variantId, isActive);
    const productId = await this.productRepository.findVariantProductId(variantId);
    if (!productId) {
      throw new NotFoundError("Variant not found");
    }
    await this.productRepository.recomputeMinPrice(productId);
    return updated;
  }
}
