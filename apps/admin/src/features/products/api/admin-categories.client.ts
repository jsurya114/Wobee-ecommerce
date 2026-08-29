import { apiFetch } from "@/lib/api-client";

export interface CategoryOption {
  id: string;
  name: string;
  slug: string;
}

/** Reuses the public, unauthenticated `GET /api/v1/categories` — no category CRUD exists this week (categories aren't part of week2 (1).md §16's operations list), this is purely the product form's category dropdown. */
export function listCategories(accessToken: string): Promise<{ categories: CategoryOption[] }> {
  return apiFetch("/api/v1/categories", { accessToken });
}
