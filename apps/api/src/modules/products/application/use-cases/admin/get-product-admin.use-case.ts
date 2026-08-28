import { NotFoundError } from "../../../../../shared/errors";
import type { AdminProductDetailEntity } from "../../../domain/entities/product.entity";
import type { ProductRepositoryPort } from "../../ports/product-repository.port";

/** Admin product detail — full variant/image set regardless of `isActive` (the edit view needs to see and reactivate a deactivated variant, unlike the customer-facing PDP). */
export class GetProductAdminUseCase {
  constructor(private readonly productRepository: ProductRepositoryPort) {}

  async execute(productId: string): Promise<AdminProductDetailEntity> {
    const product = await this.productRepository.findByIdForAdmin(productId);
    if (!product) {
      throw new NotFoundError("Product not found");
    }
    return product;
  }
}
