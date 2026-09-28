/** Narrow read ports onto `categories`, `collections` and `products` (2026-09-28) — active targets only, id -> current slug. */
export interface BannerLinkTargetsPort {
  categorySlugs(): Promise<Map<string, string>>;
  collectionSlugs(): Promise<Map<string, string>>;
  productSlugs(productIds: string[]): Promise<Map<string, string>>;
}
