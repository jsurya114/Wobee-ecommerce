import type { UpdateProductInput as UpdateProductRequest } from "@woobe/validation";
import type { AdminProductDetailEntity } from "../../../domain/entities/product.entity";
import type { ProductRepositoryPort } from "../../ports/product-repository.port";

/** Metadata edit (name/slug/description/brand/category/SEO) — activation/deactivation is its own use-case (SetProductActiveUseCase), a distinct admin action per week2 (1).md §16's own operations list. */
export class UpdateProductUseCase {
  constructor(private readonly productRepository: ProductRepositoryPort) {}

  execute(productId: string, input: UpdateProductRequest): Promise<AdminProductDetailEntity> {
    return this.productRepository.updateProduct(productId, input);
  }
}
