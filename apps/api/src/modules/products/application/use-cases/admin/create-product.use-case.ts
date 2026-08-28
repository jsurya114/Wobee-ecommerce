import type { CreateProductInput as CreateProductRequest } from "@woobe/validation";
import type { AdminProductDetailEntity } from "../../../domain/entities/product.entity";
import type { ProductRepositoryPort } from "../../ports/product-repository.port";

/** Repository maps the slug-uniqueness constraint to ConflictError, and an unknown categoryId to NotFoundError — see ProductRepository.createProduct's own comment. */
export class CreateProductUseCase {
  constructor(private readonly productRepository: ProductRepositoryPort) {}

  execute(input: CreateProductRequest): Promise<AdminProductDetailEntity> {
    return this.productRepository.createProduct(input);
  }
}
