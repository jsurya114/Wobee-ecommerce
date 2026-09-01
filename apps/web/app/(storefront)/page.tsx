import { getHomePage } from "@/features/home/api/home.client";
import { CategoryRail } from "@/features/home/components/CategoryRail";
import { CustomerReviewsSection } from "@/features/home/components/CustomerReviewsSection";
import { FeaturedCollections } from "@/features/home/components/FeaturedCollections";
import { HomeGridSection } from "@/features/home/components/HomeGridSection";
import { HomeSearchBar } from "@/features/home/components/HomeSearchBar";
import { ProductRail } from "@/features/home/components/ProductRail";
import { PromoCarousel } from "@/features/home/components/PromoCarousel";
import { ShopByBudget } from "@/features/home/components/ShopByBudget";
import { TrustStrip } from "@/features/home/components/TrustStrip";

/**
 * Shop-first homepage (redesign spec §B). One `GET /api/v1/home` call feeds
 * every section: the category rail, a New Arrivals rail, a real "Fresh
 * picks" product grid, Shop by Budget, Best Sellers, Featured Collections,
 * Customer Reviews, and a thin trust line above the footer. No hero, no big
 * serif headings, no scroll-fade — the customer meets shoppable products
 * immediately. Search lives in the header (`HeaderSearch`), not an in-page
 * bar.
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
      <HomeSearchBar />
      <PromoCarousel banners={home.banners} />
      <CategoryRail categories={home.categoryTiles} />
      <ProductRail title="New arrivals" products={home.newArrivals} seeAllHref="/products?sort=newest" />
      <HomeGridSection title="Fresh picks" products={freshPicks} seeAllHref="/products?sort=newest" />
      <ShopByBudget tiles={home.budgetTiles} />
      <ProductRail title="Best sellers" products={home.bestSellers} />
      <FeaturedCollections collections={home.featuredCollections} />
      <CustomerReviewsSection reviews={home.customerReviews} />
      <TrustStrip />
    </main>
  );
}
