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
