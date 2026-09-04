import { getHomePage } from "@/features/home/api/home.client";
import { CategoryRail } from "@/features/home/components/CategoryRail";
import { CustomerReviewsSection } from "@/features/home/components/CustomerReviewsSection";
import { FeaturedCollections } from "@/features/home/components/FeaturedCollections";
import { HomeGridSection } from "@/features/home/components/HomeGridSection";
import { CompactSearchBar } from "@/features/catalog/components/CompactSearchBar";
import { ProductRail } from "@/features/home/components/ProductRail";
import { PromoCarousel } from "@/features/home/components/PromoCarousel";
import { ShopByBudget } from "@/features/home/components/ShopByBudget";
import { ProductCard } from "@/features/catalog/components/ProductCard";
import type { ProductSummary } from "@/features/catalog/api/products.client";

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
 * every section: the category rail, a New Arrivals rail, a real "Fresh
 * picks" product grid, Shop by Budget, Best Sellers, Featured Collections,
 * Customer Reviews, and a thin trust line above the footer.
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
  const freshPicks = home.newArrivals.slice(0, 6);

  return (
    <main>
      <CompactSearchBar />
      <PromoCarousel banners={home.banners} />
      <CategoryRail categories={home.categoryTiles} />
      <ProductRail title="New arrivals" seeAllHref="/products?sort=newest">
        {home.newArrivals.map(railItem)}
      </ProductRail>
      <HomeGridSection title="Fresh picks" products={freshPicks} seeAllHref="/products?sort=newest" />
      <ShopByBudget tiles={home.budgetTiles} />
      <ProductRail title="Best sellers">{home.bestSellers.map(railItem)}</ProductRail>
      <FeaturedCollections collections={home.featuredCollections} />
      <CustomerReviewsSection reviews={home.customerReviews} />
    </main>
  );
}
