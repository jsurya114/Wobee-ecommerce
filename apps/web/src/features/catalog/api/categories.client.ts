import { apiFetch } from "@/lib/api-client";

export interface Category {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
}

export function listCategories(): Promise<{ categories: Category[] }> {
  return apiFetch<{ categories: Category[] }>("/api/v1/categories");
}
