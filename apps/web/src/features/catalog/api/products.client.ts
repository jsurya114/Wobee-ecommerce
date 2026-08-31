import { apiFetch } from "@/lib/api-client";

export interface ProductImage {
  url: string;
  altText: string;
  sortOrder: number;
}

export interface ProductSummary {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  categoryId: string;
  /** Display/sort cache (ADR-012) — never the checkout price source. */
  minPricePaiseCache: number;
  primaryImage: ProductImage | null;
  /**
   * "From" (cheapest active variant) weight + its effective rate/kg — the
   * weight-based-pricing trust signal shown on every card. Server-resolved;
   * both null when the product has no active variant. Display only — the
   * price shown is still `minPricePaiseCache`.
   */
  fromWeightGrams: number | null;
  fromRatePerKgPaise: number | null;
}

export interface ProductListResult {
  products: ProductSummary[];
  page: number;
  limit: number;
  total: number;
}

export const PRODUCT_SORT_VALUES = ["price_asc", "price_desc", "newest"] as const;
export type ProductSort = (typeof PRODUCT_SORT_VALUES)[number];

/** Everything GET /api/v1/products accepts (Week 2 Day 1, ADR-012) — mirrors packages/validation's productListQuerySchema. */
export interface ProductListParams {
  category?: string;
  collection?: string;
  q?: string;
  /** Comma-separated on the wire — pass an array, this joins it. */
  size?: string[];
  color?: string[];
  inStock?: boolean;
  minPrice?: number;
  maxPrice?: number;
  sort?: ProductSort;
  page?: number;
  limit?: number;
}

export function listProducts(params: ProductListParams = {}): Promise<ProductListResult> {
  const query = new URLSearchParams();
  if (params.category) query.set("category", params.category);
  if (params.collection) query.set("collection", params.collection);
  if (params.q) query.set("q", params.q);
  if (params.size?.length) query.set("size", params.size.join(","));
  if (params.color?.length) query.set("color", params.color.join(","));
  if (params.inStock !== undefined) query.set("inStock", String(params.inStock));
  if (params.minPrice !== undefined) query.set("minPrice", String(params.minPrice));
  if (params.maxPrice !== undefined) query.set("maxPrice", String(params.maxPrice));
  if (params.sort) query.set("sort", params.sort);
  if (params.page) query.set("page", String(params.page));
  if (params.limit) query.set("limit", String(params.limit));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiFetch<ProductListResult>(`/api/v1/products${suffix}`);
}

export interface VariantWithPriceAndStock {
  id: string;
  sku: string;
  color: string;
  size: string;
  weightGrams: number;
  pricePaise: number;
  ratePerKgPaise: number;
  availableQuantity: number;
  inStock: boolean;
  /** Free-text product details for the PDP "Details" disclosure (redesign O-2) — null unless the admin set them. */
  fabric: string | null;
  fit: string | null;
  measurements: string | null;
}

export interface ProductDetail {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  brand: string | null;
  category: { id: string; name: string; slug: string };
  images: ProductImage[];
  variants: VariantWithPriceAndStock[];
  /** Admin-editable SEO overrides (week2 (1).md §19) — null unless set, generateMetadata falls back to name/description when so. */
  metaTitle: string | null;
  metaDescription: string | null;
}

export function getProductBySlug(slug: string): Promise<{ product: ProductDetail }> {
  return apiFetch<{ product: ProductDetail }>(`/api/v1/products/${encodeURIComponent(slug)}`);
}

/**
 * PDP "Related Products" — other products in the current product's category
 * (backend `GetRelatedProductsUseCase`; no cross-category fallback). Returns
 * the same `ProductSummary` shape as `listProducts`, so the card grid is
 * reused as-is; an empty array means "hide the section".
 */
export function getRelatedProducts(slug: string): Promise<{ products: ProductSummary[] }> {
  return apiFetch<{ products: ProductSummary[] }>(`/api/v1/products/${encodeURIComponent(slug)}/related`);
}

/** Lean typeahead row — matches the API's `ProductSuggestionEntity`. */
export interface ProductSuggestion {
  id: string;
  slug: string;
  name: string;
  minPricePaiseCache: number;
  primaryImage: ProductImage | null;
}

/** Search-box typeahead (redesign). Capped server-side; a query under 2 chars returns `[]`. Pass an `AbortSignal` so stale in-flight requests can be cancelled. */
export function searchProductSuggestions(q: string, signal?: AbortSignal): Promise<{ suggestions: ProductSuggestion[] }> {
  return apiFetch<{ suggestions: ProductSuggestion[] }>(`/api/v1/products/suggestions?q=${encodeURIComponent(q)}`, { signal });
}
