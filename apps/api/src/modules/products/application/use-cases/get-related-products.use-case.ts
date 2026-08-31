import type { ProductSummaryEntity } from "../../domain/entities/product.entity";
import type { PricingReaderPort } from "../ports/pricing-reader.port";
import type { ProductRepositoryPort } from "../ports/product-repository.port";
import { resolveFromPricing } from "./list-products.use-case";

/** How many products the PDP "Related Products" section asks for (task: 4–8). */
export const RELATED_PRODUCTS_LIMIT = 8;

/**
 * PDP related products — other ACTIVE products in the CURRENT product's
 * category (`Product.categoryId`, the one required category relationship in
 * the data model), never the product itself, capped at
 * `RELATED_PRODUCTS_LIMIT`.
 *
 * Deliberately NO cross-category fallback: relevance is the category. An
 * unknown/inactive slug, a product whose category has nothing else in it,
 * or an empty catalogue all yield `[]` — the frontend then hides the
 * section rather than showing unrelated products. Visibility matches the
 * catalogue listing exactly (`isActive`), so a hidden product is never
 * recommended. `from*` pricing fields are resolved through the shared
 * `resolveFromPricing` helper the listing/home use-cases already use — no
 * duplicated pricing logic here.
 */
export class GetRelatedProductsUseCase {
  constructor(
    private readonly productRepository: ProductRepositoryPort,
    private readonly pricingReader: PricingReaderPort,
  ) {}

  async execute(slug: string, limit: number = RELATED_PRODUCTS_LIMIT): Promise<ProductSummaryEntity[]> {
    if (limit <= 0) return [];

    const product = await this.productRepository.findBySlug(slug);
    if (!product) return [];

    const sameCategory = await this.productRepository.findRelatedProducts({
      excludeProductId: product.id,
      categoryId: product.category.id,
      limit,
    });

    return resolveFromPricing(sameCategory, this.pricingReader);
  }
}
