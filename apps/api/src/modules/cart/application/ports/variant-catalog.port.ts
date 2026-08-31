import type { PricingMode } from "@woobe/types";

export interface CartVariantDetail {
  id: string;
  productId: string;
  /** Week 2 Day 5 (week2 (1).md §9) — coupon category-applicability matching. */
  categoryId: string;
  /** The product's category pricing mode (2026-08-31) — see compute-cart-totals.ts for why cart needs this. */
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
 * Narrow port for this module's one dependency on `products` — decouples
 * cart's application layer from products' concrete use-case class (DIP);
 * the composition root wires it with a one-line pass-through adapter.
 */
export interface VariantCatalogPort {
  getVariants(variantIds: string[]): Promise<Map<string, CartVariantDetail>>;
}
