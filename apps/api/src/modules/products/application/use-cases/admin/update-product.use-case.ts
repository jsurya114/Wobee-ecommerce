import type { UpdateProductInput as UpdateProductRequest } from "@woobe/validation";
import { resolveUniqueSlug } from "../../../domain/resolve-unique-slug";
import type { AdminProductDetailEntity } from "../../../domain/entities/product.entity";
import type { ProductRepositoryPort } from "../../ports/product-repository.port";

/**
 * Metadata edit (name/slug/description/brand/category/SEO) — activation/deactivation is its own use-case (SetProductActiveUseCase), a distinct admin action per week2 (1).md §16's own operations list.
 *
 * Slug is left untouched unless the admin explicitly supplies one — editing
 * the product NAME must never silently change its slug (would break any
 * existing external link/bookmark to the product). When a slug IS supplied,
 * it's still canonicalized + de-duplicated the same way create does,
 * excluding this product's own current row from the uniqueness check (so
 * re-saving the form with its own unchanged slug never false-positives as
 * "taken").
 */
export class UpdateProductUseCase {
  constructor(private readonly productRepository: ProductRepositoryPort) {}

  async execute(productId: string, input: UpdateProductRequest): Promise<AdminProductDetailEntity> {
    if (input.slug === undefined) {
      return this.productRepository.updateProduct(productId, input);
    }
    const slug = await resolveUniqueSlug(input.slug, (candidate) => this.productRepository.slugExists(candidate, productId));
    return this.productRepository.updateProduct(productId, { ...input, slug });
  }
}
