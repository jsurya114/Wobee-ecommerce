import type { PricingMode } from "@woobe/types";
import type { ProductRepositoryPort } from "../ports/product-repository.port";

export interface CartVariantDetail {
  id: string;
  productId: string;
  /** Week 2 Day 5 (week2 (1).md §9) — needed for coupon category-applicability matching, not used before this. */
  categoryId: string;
  /** The product's category pricing mode (2026-08-31) — cart needs this to price the line AND to exclude FIXED items from the weight-threshold total (see compute-cart-totals.ts). */
  pricingMode: PricingMode;
  productName: string;
  productSlug: string;
  image: string | null;
  sku: string;
  color: string;
  size: string;
  weightGrams: number;
  ratePerKgOverridePaise: number | null;
  /** Authoritative when pricingMode is FIXED. */
  fixedPricePaise: number | null;
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
