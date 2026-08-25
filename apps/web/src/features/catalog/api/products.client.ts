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

export function listProducts(params: { category?: string; page?: number; limit?: number } = {}): Promise<ProductListResult> {
  const query = new URLSearchParams();
  if (params.category) query.set("category", params.category);
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
}

export function getProductBySlug(slug: string): Promise<{ product: ProductDetail }> {
  return apiFetch<{ product: ProductDetail }>(`/api/v1/products/${encodeURIComponent(slug)}`);
}
