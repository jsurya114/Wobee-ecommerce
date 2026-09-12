import { getHomePage } from "@/features/home/api/home.client";
import { CategoryRail } from "@/features/home/components/CategoryRail";
import { TestimonialsSection } from "@/features/home/components/TestimonialsSection";
import { FeaturedCollections } from "@/features/home/components/FeaturedCollections";
import { CompactSearchBar } from "@/features/catalog/components/CompactSearchBar";
import { ProductRail } from "@/features/home/components/ProductRail";
import { PromoCarousel } from "@/features/home/components/PromoCarousel";
import { ShopByBudget } from "@/features/home/components/ShopByBudget";
import { ShopYourSize } from "@/features/home/components/ShopYourSize";
import { ProductCard } from "@/features/catalog/components/ProductCard";
import type { ProductSummary } from "@/features/catalog/api/products.client";
import { ScrollToHashOnLoad } from "@/features/home/components/ScrollToHashOnLoad";

/** Server-rendered per rail item — the same sizing wrapper `ProductRail`'s track previously applied itself, now built by this (server) caller so `ProductCard` never enters `ProductRail`'s client bundle. */
function railItem(product: ProductSummary) {
  return (
    <div key={product.id} className="min-w-0 flex-[0_0_31%] pl-2.5 sm:flex-[0_0_24%] lg:flex-[0_0_18%]">
      <ProductCard product={product} showQuickAdd />
    </div>
  );
}
/**
 * Shop-first homepage (redesign spec §B). One `GET /api/v1/home` call feeds
 * every section: the category rail, Shop your size, a New Arrivals rail,
 * Shop by Budget, Loved by Customers, Curated Collections, "What Our
 * Customers Say" (2026-09-11, replaces the old per-product Customer
 * Reviews rail with store-experience testimonials), and a thin trust line
 * above the footer.
 *
 * Merchandising logic corrections (2026-09-06, homepage audit): "Fresh
 * picks" is gone — it was never a distinct query, just `newArrivals`
 * re-sliced under a second label (audit finding C), so New Arrivals is now
 * the single freshness rail. "Best sellers" is relabeled "Loved by
 * Customers" and "Featured collections" is relabeled "Curated Collections"
 * — both are label-only changes here; the corrected underlying logic
 * (DELIVERED-only + stock-aware ranking, honest "manually curated" framing)
 * lives in `GetHomePageUseCase`. Section order also moves "Shop your size"
 * right after category discovery — a scarce, mostly single-unit catalogue
 * makes "does my size exist at all" a first-screen question, not a PLP-only
 * filter (audit finding E).
 *
 * Search: `HeaderSearch` (in `SiteHeader`, every page) is the one search
 * entry point on desktop. `CompactSearchBar` below is additional and
 * mobile-only (`md:hidden`) — an explicit client request (reference photo,
 * 2026-09-03) for a persistent minimal search row under the header on small
 * screens, where the header's own expandable search is easy to miss. Keep
 * both — this is a deliberate product decision, not leftover scope.
 *
 * `dynamic = "force-dynamic"` (ADR-026): render live, per-request — product
 * and price data must never be frozen at build time.
 */
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const home = await getHomePage();

  return (
    <main>
      <ScrollToHashOnLoad />
      <CompactSearchBar />
      <PromoCarousel banners={home.banners} />
      <CategoryRail categories={home.categoryTiles} />
      <ShopYourSize sizes={home.sizeAvailability} />
      <ProductRail title="New arrivals" seeAllHref="/products?sort=newest">
        {home.newArrivals.map(railItem)}
      </ProductRail>
      <ShopByBudget tiles={home.budgetTiles} />
      <ProductRail id="loved-by-customers" title="Loved by customers">
        {home.bestSellers.map(railItem)}
      </ProductRail>
      <FeaturedCollections collections={home.featuredCollections} />
      <TestimonialsSection testimonials={home.testimonials} aggregate={home.testimonialAggregate} />
    </main>
  );
}
