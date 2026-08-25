import type { ProductRepositoryPort } from "../ports/product-repository.port";

export interface CartVariantDetail {
  id: string;
  productId: string;
  productName: string;
  productSlug: string;
  image: string | null;
  sku: string;
  color: string;
  size: string;
  weightGrams: number;
  ratePerKgOverridePaise: number | null;
  isActive: boolean;
}

/**
 * Exported from products.module.ts for cross-module use — the cart module
 * calls this instead of importing Prisma's Product/ProductVariant models
 * itself (ADR-010: those belong to `products`, not `cart`).
 */
export class GetVariantsForCartUseCase {
  constructor(private readonly productRepository: ProductRepositoryPort) {}

  async execute(variantIds: string[]): Promise<Map<string, CartVariantDetail>> {
    if (variantIds.length === 0) return new Map();
    const rows = await this.productRepository.findVariantsByIds(variantIds);
    return new Map(rows.map((row) => [row.id, row]));
  }
}
