import type { ProductRepositoryPort } from "../../ports/product-repository.port";

export class RemoveProductImageUseCase {
  constructor(private readonly productRepository: ProductRepositoryPort) {}

  execute(productId: string, imageId: string): Promise<void> {
    return this.productRepository.removeImage(productId, imageId);
  }
}
