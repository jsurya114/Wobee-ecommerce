import { apiFetch } from "@/lib/api-client";

export interface AdminProductSummary {
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

export interface AdminProductVariant {
  id: string;
  sku: string;
  color: string;
  size: string;
  weightGrams: number;
  ratePerKgOverridePaise: number | null;
  /** Authoritative when the product's category is FIXED (2026-08-31). */
  fixedPricePaise: number | null;
  effectivePricePaiseCache: number;
  fabric: string | null;
  fit: string | null;
  measurements: string | null;
  isActive: boolean;
}

export interface AdminProductImage {
  id: string;
  url: string;
  altText: string;
  sortOrder: number;
}

export interface AdminProductDetail {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  brand: string | null;
  categoryId: string;
  /** The category's pricing mode (2026-08-31) — decides whether VariantForm shows "Rate/kg override" or "Fixed price". */
  categoryPricingMode: "WEIGHT_BASED" | "FIXED";
  isActive: boolean;
  minPricePaiseCache: number;
  metaTitle: string | null;
  metaDescription: string | null;
  images: AdminProductImage[];
  variants: AdminProductVariant[];
}

export interface ListProductsParams {
  search?: string;
  categoryId?: string;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}

export interface CreateProductPayload {
  name: string;
  slug: string;
  description?: string;
  brand?: string;
  categoryId: string;
  metaTitle?: string;
  metaDescription?: string;
}

export type UpdateProductPayload = Partial<CreateProductPayload>;

export interface VariantPayload {
  sku: string;
  color: string;
  size: string;
  weightGrams: number;
  ratePerKgOverridePaise?: number | null;
  /** Required when the product's category is FIXED (2026-08-31); ignored for WEIGHT_BASED. */
  fixedPricePaise?: number | null;
  fabric?: string | null;
  fit?: string | null;
  measurements?: string | null;
  initialQuantity?: number;
}

export type UpdateVariantPayload = Partial<Omit<VariantPayload, "initialQuantity">>;

function toQuery(params: ListProductsParams): string {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.categoryId) query.set("categoryId", params.categoryId);
  if (params.isActive !== undefined) query.set("isActive", String(params.isActive));
  query.set("page", String(params.page ?? 1));
  query.set("pageSize", String(params.pageSize ?? 20));
  return query.toString();
}

export function listProducts(params: ListProductsParams, accessToken: string): Promise<{ items: AdminProductSummary[]; total: number }> {
  return apiFetch(`/api/v1/admin/products?${toQuery(params)}`, { accessToken });
}

export function getProduct(id: string, accessToken: string): Promise<{ product: AdminProductDetail }> {
  return apiFetch(`/api/v1/admin/products/${id}`, { accessToken });
}

export function createProduct(input: CreateProductPayload, accessToken: string): Promise<{ product: AdminProductDetail }> {
  return apiFetch("/api/v1/admin/products", { method: "POST", body: input, accessToken });
}

export function updateProduct(id: string, input: UpdateProductPayload, accessToken: string): Promise<{ product: AdminProductDetail }> {
  return apiFetch(`/api/v1/admin/products/${id}`, { method: "PATCH", body: input, accessToken });
}

export function setProductActive(id: string, isActive: boolean, accessToken: string): Promise<{ product: AdminProductDetail }> {
  return apiFetch(`/api/v1/admin/products/${id}/active`, { method: "POST", body: { isActive }, accessToken });
}

export function createVariant(productId: string, input: VariantPayload, accessToken: string): Promise<{ variant: AdminProductVariant }> {
  return apiFetch(`/api/v1/admin/products/${productId}/variants`, { method: "POST", body: input, accessToken });
}

export function updateVariant(
  productId: string,
  variantId: string,
  input: UpdateVariantPayload,
  accessToken: string,
): Promise<{ variant: AdminProductVariant }> {
  return apiFetch(`/api/v1/admin/products/${productId}/variants/${variantId}`, { method: "PATCH", body: input, accessToken });
}

export function setVariantActive(
  productId: string,
  variantId: string,
  isActive: boolean,
  accessToken: string,
): Promise<{ variant: AdminProductVariant }> {
  return apiFetch(`/api/v1/admin/products/${productId}/variants/${variantId}/active`, { method: "POST", body: { isActive }, accessToken });
}

export function addImage(productId: string, url: string, altText: string, accessToken: string): Promise<{ image: AdminProductImage }> {
  return apiFetch(`/api/v1/admin/products/${productId}/images`, { method: "POST", body: { url, altText }, accessToken });
}

export function removeImage(productId: string, imageId: string, accessToken: string): Promise<void> {
  return apiFetch(`/api/v1/admin/products/${productId}/images/${imageId}`, { method: "DELETE", accessToken });
}

export function reorderImages(productId: string, imageIds: string[], accessToken: string): Promise<void> {
  return apiFetch(`/api/v1/admin/products/${productId}/images/order`, { method: "PUT", body: { imageIds }, accessToken });
}
