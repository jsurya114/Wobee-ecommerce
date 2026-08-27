import { apiFetch } from "@/lib/api-client";

export interface Collection {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

/** Week 2 Day 1 — listing only (GET /api/v1/collections). Detail pages/rails are Day 2. */
export function listCollections(): Promise<{ collections: Collection[] }> {
  return apiFetch<{ collections: Collection[] }>("/api/v1/collections");
}
