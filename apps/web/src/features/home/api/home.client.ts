import { apiFetch } from "@/lib/api-client";
import type { Collection } from "@/features/catalog/api/collections.client";
import type { ProductSummary } from "@/features/catalog/api/products.client";

export interface HomeReview {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  createdAt: string;
  product: { id: string; slug: string; name: string; image: string | null };
}

export interface HomePageData {
  newArrivals: ProductSummary[];
  bestSellers: ProductSummary[];
  featuredCollections: Collection[];
  customerReviews: HomeReview[];
}

/** Week 2 Day 8 Part 2 (week2 (1).md §12) — one call for the whole homepage instead of one round trip per section. */
export function getHomePage(): Promise<HomePageData> {
  return apiFetch<HomePageData>("/api/v1/home");
}
