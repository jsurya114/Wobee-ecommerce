import { apiFetch } from "@/lib/api-client";

export interface AdminCategory {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  imageUrl: string | null;
  isActive: boolean;
  pricingMode: "WEIGHT_BASED" | "FIXED";
  productCount: number;
}

export interface CategoryPayload {
  name: string;
  slug: string;
  imageUrl?: string | null;
}

export function listCategoriesAdmin(accessToken: string): Promise<{ categories: AdminCategory[] }> {
  return apiFetch("/api/v1/admin/categories", { accessToken });
}

export function getCategory(id: string, accessToken: string): Promise<{ category: AdminCategory }> {
  return apiFetch(`/api/v1/admin/categories/${id}`, { accessToken });
}

export function createCategory(input: CategoryPayload, accessToken: string): Promise<{ category: AdminCategory }> {
  return apiFetch("/api/v1/admin/categories", { method: "POST", body: input, accessToken });
}

export function updateCategory(id: string, input: Partial<CategoryPayload>, accessToken: string): Promise<{ category: AdminCategory }> {
  return apiFetch(`/api/v1/admin/categories/${id}`, { method: "PATCH", body: input, accessToken });
}

export function setCategoryActive(id: string, isActive: boolean, accessToken: string): Promise<{ category: AdminCategory }> {
  return apiFetch(`/api/v1/admin/categories/${id}/active`, { method: "POST", body: { isActive }, accessToken });
}

export function reorderCategories(categoryIds: string[], accessToken: string): Promise<void> {
  return apiFetch("/api/v1/admin/categories/order", { method: "PUT", body: { categoryIds }, accessToken });
}
