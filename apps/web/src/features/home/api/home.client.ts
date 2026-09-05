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

export interface HomeCategoryTile {
  id: string;
  name: string;
  slug: string;
  /** Representative product image, or null — the rail falls back to a tinted initial. */
  imageUrl: string | null;
}

export interface HomeBanner {
  id: string;
  imageUrl: string;
  title: string | null;
  subtitle: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
}

export interface HomeBudgetTile {
  label: string;
  maxPricePaise: number;
  /** The cheapest qualifying product's own image, or null if nothing qualifies yet. */
  imageUrl: string | null;
}

export interface HomePageData {
  banners: HomeBanner[];
  categoryTiles: HomeCategoryTile[];
  newArrivals: ProductSummary[];
  bestSellers: ProductSummary[];
  featuredCollections: Collection[];
  customerReviews: HomeReview[];
  budgetTiles: HomeBudgetTile[];
}

/**
 * Week 2 Day 8 Part 2 (week2 (1).md §12) — one call for the whole homepage
 * instead of one round trip per section.
 *
 * Perf fix (2026-09-05, ADR-026's own "revisit later" clause): the page
 * itself stays `dynamic = "force-dynamic"` — unchanged, still no build-time
 * dependency on a live API — but this one `fetch` now carries a 60s Next.js
 * Data Cache window. `GET /api/v1/home` is public/unauthenticated (same
 * response for every visitor, see `HomeController`'s own doc comment) and
 * every figure it returns is already a display-only value elsewhere in the
 * codebase (`minPricePaiseCache` etc. — checkout/cart always recompute
 * live, per `DEVELOPMENT_RULES.md` #1), so a bounded 60s staleness window
 * on the homepage's browse content doesn't touch that guarantee. This is
 * what was actually making Home feel slower than Account/Wishlist/Cart
 * (those render `○ Static` — zero backend round trip — while every Home
 * navigation re-ran this use case's full fan-out live): confirmed with a
 * production build + real navigation trace, ~356ms Home LCP vs ~55ms
 * Account LCP before this change, both driven by this one round trip.
 */
export function getHomePage(): Promise<HomePageData> {
  return apiFetch<HomePageData>("/api/v1/home", { next: { revalidate: 60 } });
}
