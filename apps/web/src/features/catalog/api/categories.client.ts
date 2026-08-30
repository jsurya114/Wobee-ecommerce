import { apiFetch } from "@/lib/api-client";

export interface Category {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  /** Category art (`/imgs/…` when set by seed/admin) — null otherwise. */
  imageUrl: string | null;
}

export function listCategories(): Promise<{ categories: Category[] }> {
  return apiFetch<{ categories: Category[] }>("/api/v1/categories");
}
