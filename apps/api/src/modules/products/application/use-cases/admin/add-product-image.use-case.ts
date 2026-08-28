import type { AdminProductImageEntity } from "../../../domain/entities/product.entity";
import type { ProductRepositoryPort } from "../../ports/product-repository.port";

/**
 * week2 (1).md §16's "Media" operation — attaches an already-uploaded
 * `media` file (Week 2 Day 4's `POST /api/v1/media`, itself unchanged) to a
 * product as a `ProductImage`. Deliberately two separate steps, not one
 * combined upload-and-attach endpoint: `ProductImage.url` is a plain string
 * with no FK to `Media` (schema.prisma's own shape), and reusing the
 * existing, already-tested upload endpoint here is simpler than teaching
 * this module to also accept multipart uploads and own storage concerns
 * it has no reason to duplicate.
 */
export class AddProductImageUseCase {
  constructor(private readonly productRepository: ProductRepositoryPort) {}

  execute(productId: string, url: string, altText: string): Promise<AdminProductImageEntity> {
    return this.productRepository.addImage(productId, { url, altText });
  }
}
