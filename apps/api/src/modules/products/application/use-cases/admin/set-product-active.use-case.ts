import type { AdminProductDetailEntity } from "../../../domain/entities/product.entity";
import type { ProductRepositoryPort } from "../../ports/product-repository.port";

/** "Deactivate" (week2 (1).md §16) — an inactive product drops out of the customer-facing listing/detail endpoints immediately (both are `isActive`-filtered), without deleting it or its variants/images/order history. */
export class SetProductActiveUseCase {
  constructor(private readonly productRepository: ProductRepositoryPort) {}

  execute(productId: string, isActive: boolean): Promise<AdminProductDetailEntity> {
    return this.productRepository.setProductActive(productId, isActive);
  }
}
