import { apiFetch } from "@/lib/api-client";

export interface Collection {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

/** Week 2 Day 1 — listing (GET /api/v1/collections). */
export function listCollections(): Promise<{ collections: Collection[] }> {
  return apiFetch<{ collections: Collection[] }>("/api/v1/collections");
}

/** Week 2 Day 2 — customer detail (GET /api/v1/collections/:slug). The product rail itself is sourced separately via listProducts({ collection: slug }) — see collections.module.ts's own doc comment on why that isn't duplicated here. */
export function getCollectionBySlug(slug: string): Promise<{ collection: Collection }> {
  return apiFetch<{ collection: Collection }>(`/api/v1/collections/${encodeURIComponent(slug)}`);
}
