import type { CreateProductInput as CreateProductRequest } from "@woobe/validation";
import { resolveUniqueSlug } from "../../../domain/resolve-unique-slug";
import type { AdminProductDetailEntity } from "../../../domain/entities/product.entity";
import type { ProductRepositoryPort } from "../../ports/product-repository.port";

/**
 * Slug is auto-generated from the name (or the admin's typed override, if
 * they touched the field) and canonicalized + de-duplicated server-side —
 * the client's live preview is a preview only, never authoritative. See
 * `resolveUniqueSlug`'s own doc comment for the collision-retry shape.
 * Repository still maps any raw slug-uniqueness race to ConflictError as a
 * last-resort safety net (see ProductRepository.createProduct's own
 * comment) — that path should be unreachable in practice now.
 */
export class CreateProductUseCase {
  constructor(private readonly productRepository: ProductRepositoryPort) {}

  async execute(input: CreateProductRequest): Promise<AdminProductDetailEntity> {
    const slug = await resolveUniqueSlug(input.slug, (candidate) => this.productRepository.slugExists(candidate));
    return this.productRepository.createProduct({ ...input, slug });
  }
}
