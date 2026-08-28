export interface ReviewProductDetail {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
}

/** Narrow port onto `products` — only what a review submission needs to confirm the product genuinely exists (ADR-010: reviews doesn't touch Product directly). */
export interface ProductCatalogPort {
  getProducts(productIds: string[]): Promise<Map<string, ReviewProductDetail>>;
}
