export interface WishlistVariantDetail {
  id: string;
  productId: string;
  sku: string;
  color: string;
  size: string;
  weightGrams: number;
  isActive: boolean;
}

/** Narrow port for this module's one dependency on `products` variant data — same DIP rationale as product-catalog.port.ts; wired to the same GetVariantsForCartUseCase cart already reuses. */
export interface VariantCatalogPort {
  getVariants(variantIds: string[]): Promise<Map<string, WishlistVariantDetail>>;
}
