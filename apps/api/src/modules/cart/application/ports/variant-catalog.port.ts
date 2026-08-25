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
 * Narrow port for this module's one dependency on `products` — decouples
 * cart's application layer from products' concrete use-case class (DIP);
 * the composition root wires it with a one-line pass-through adapter.
 */
export interface VariantCatalogPort {
  getVariants(variantIds: string[]): Promise<Map<string, CartVariantDetail>>;
}
