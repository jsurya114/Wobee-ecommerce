import { listCategories } from "@/features/catalog/api/categories.client";
import { getHomePage } from "@/features/home/api/home.client";
import { CategoryTiles } from "@/features/home/components/CategoryTiles";
import { CustomerReviewsSection } from "@/features/home/components/CustomerReviewsSection";
import { FeaturedCollections } from "@/features/home/components/FeaturedCollections";
import { ProductRail } from "@/features/home/components/ProductRail";
import { Reveal } from "@/features/home/components/Reveal";
import { TrustStrip } from "@/features/home/components/TrustStrip";

/**
 * Real-data homepage (woobe_ui_design_plan.md §8, expanded Week 2 Day 8
 * Part 2 per week2 (1).md §12 — Module 12). The brand-story Hero was later
 * dropped (marketplace convention — open on the catalogue, not a pitch);
 * the trust strip moved below the product rails. New Arrivals, Best
 * Sellers, Featured Collections, and Customer Reviews come from GET
 * /api/v1/home — one call composing four already-real, already-approved
 * sources (see that endpoint's own GetHomePageUseCase doc comment) instead
 * of the previous single price-sorted rail mislabeled "New drops". Sections still needing
 * content that doesn't exist (UGC photos, video, "Shop by Vibe," Offers,
 * Build Your Look) remain deliberately unbuilt, not placeholder-stuffed —
 * see Module 12's own "do not invent" list.
 *
 * `dynamic = "force-dynamic"` (ADR-026, Week 2 Day 0): without this, Next
 * tries to statically generate this page at `next build` time, which needs
 * a live `apps/api` reachable *during the build* — true only by coincidence
 * locally, false in CI, and stale-by-design even when it does succeed
 * (frozen product/price data from whenever the build ran). Render live,
 * per-request, same as `/products` already does.
 */
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [{ categories }, home] = await Promise.all([listCategories(), getHomePage()]);

  return (
    // No brand-story hero (marketplace convention, à la limeroad) — the page
    // opens straight into the catalogue.
    <main>
      <Reveal>
        <CategoryTiles categories={categories} />
      </Reveal>
      <Reveal>
        <ProductRail title="New arrivals" products={home.newArrivals} />
      </Reveal>
      <Reveal>
        <ProductRail title="Best sellers" products={home.bestSellers} />
      </Reveal>
      <Reveal>
        <FeaturedCollections collections={home.featuredCollections} />
      </Reveal>
      <TrustStrip />
      <Reveal>
        <CustomerReviewsSection reviews={home.customerReviews} />
      </Reveal>
    </main>
  );
}
