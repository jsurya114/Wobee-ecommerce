import { apiFetch } from "@/lib/api-client";
import type { Collection } from "@/features/catalog/api/collections.client";
import type { ProductSummary } from "@/features/catalog/api/products.client";

/** A store-experience testimonial (2026-09-11, replaces the old per-product HomeReview) — never a product reference; `displayName` is server-derived "First L.", never a raw customer name/id. */
export interface HomeTestimonial {
  id: string;
  rating: number;
  text: string;
  createdAt: string;
  displayName: string;
  images: { id: string; url: string }[];
}

export interface HomeTestimonialAggregate {
  averageRating: number;
  approvedCount: number;
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

/** One "Shop your size" pill — `size` matches the PLP's own `SIZE_OPTIONS` values 1:1, so it links straight into the existing `?size=` filter. */
export interface HomeSizeOption {
  size: string;
  count: number;
}

export interface HomePageData {
  banners: HomeBanner[];
  categoryTiles: HomeCategoryTile[];
  newArrivals: ProductSummary[];
  /** Rendered as "Loved by Customers" (merchandising logic corrections, 2026-09-06) — see GetHomePageUseCase's own doc comment for what now counts toward this. */
  bestSellers: ProductSummary[];
  /** Rendered as "Curated Collections" (2026-09-06 — the "Featured"/"New Drops" labels implied a lifecycle this data never had). */
  featuredCollections: Collection[];
  /** "What our customers say" — APPROVED testimonials only, server-filtered. */
  testimonials: HomeTestimonial[];
  /** null when there are zero approved testimonials — omit the aggregate display entirely, never show a fabricated 0/5. */
  testimonialAggregate: HomeTestimonialAggregate | null;
  budgetTiles: HomeBudgetTile[];
  /** "Shop your size" rail — already sorted (curated order) and already filtered to sizes with at least one live variant. */
  sizeAvailability: HomeSizeOption[];
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
