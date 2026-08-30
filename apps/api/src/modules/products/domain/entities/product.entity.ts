export interface ProductImageEntity {
  url: string;
  altText: string;
  sortOrder: number;
}

export interface ProductVariantEntity {
  id: string;
  sku: string;
  color: string;
  size: string;
  weightGrams: number;
  ratePerKgOverridePaise: number | null;
  /** Free-text product details (admin-set since Week 2 Day 7) — surfaced on the customer PDP's "Details" disclosure (redesign O-2). */
  fabric: string | null;
  fit: string | null;
  measurements: string | null;
  isActive: boolean;
}

export interface ProductSummaryEntity {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  categoryId: string;
  /** Display/sort cache (ADR-012) — listing uses this, never checkout. */
  minPricePaiseCache: number;
  primaryImage: ProductImageEntity | null;
  /**
   * The "from" (cheapest active variant) weight and its effective rate/kg —
   * Woobe's weight-based pricing surfaced on every card / rail / search
   * result, not just the PDP. `fromRatePerKgPaise` is resolved through the
   * pricing port in the listing/home use-cases (the repository never
   * derives a rate — see product-repository.port.ts). Both are `null` only
   * when the product has no active variant. This is a display/trust signal,
   * NOT an authoritative price — the shown price is still `minPricePaiseCache`.
   */
  fromWeightGrams: number | null;
  fromRatePerKgPaise: number | null;
}

/**
 * Lightweight typeahead row for the search box (redesign) — just enough to
 * render a suggestion: no variants, no facets, no pagination, no pricing
 * projection. `minPricePaiseCache` is the display cache (ADR-012), same as
 * the listing summary.
 */
export interface ProductSuggestionEntity {
  id: string;
  slug: string;
  name: string;
  minPricePaiseCache: number;
  primaryImage: ProductImageEntity | null;
}

export interface ProductDetailEntity {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  brand: string | null;
  category: { id: string; name: string; slug: string };
  images: ProductImageEntity[];
  variants: ProductVariantEntity[];
  /**
   * Week 2 Day 9 (week2 (1).md §19) — admin-editable since Day 7
   * (AdminProductDetailEntity already had these), now finally exposed on
   * the customer-facing detail too so `generateMetadata` has real
   * per-product SEO copy to render instead of falling back to name/
   * description on every page. Falls back to `name`/`description` in the
   * frontend, not here — this stays a faithful passthrough of what the
   * admin actually set (or didn't).
   */
  metaTitle: string | null;
  metaDescription: string | null;
}

/**
 * Admin-facing shapes (Week 2 Day 7, week2 (1).md §16) — separate from the
 * customer-facing entities above rather than adding optional fields to
 * them: admin needs `id`s to reference/mutate specific images and every
 * variant regardless of `isActive`, neither of which the customer-facing
 * shapes expose (ADR-011's own "never trust/leak more than the caller
 * needs" spirit, applied to response shape too, not just money).
 */
export interface AdminProductImageEntity {
  id: string;
  url: string;
  altText: string;
  sortOrder: number;
}

export interface AdminProductVariantEntity {
  id: string;
  sku: string;
  color: string;
  size: string;
  weightGrams: number;
  ratePerKgOverridePaise: number | null;
  effectivePricePaiseCache: number;
  fabric: string | null;
  fit: string | null;
  measurements: string | null;
  isActive: boolean;
}

export interface AdminProductSummaryEntity {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  categoryId: string;
  categoryName: string;
  isActive: boolean;
  minPricePaiseCache: number;
  variantCount: number;
  primaryImageUrl: string | null;
}

export interface AdminProductDetailEntity {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  brand: string | null;
  categoryId: string;
  isActive: boolean;
  minPricePaiseCache: number;
  metaTitle: string | null;
  metaDescription: string | null;
  images: AdminProductImageEntity[];
  variants: AdminProductVariantEntity[];
}
