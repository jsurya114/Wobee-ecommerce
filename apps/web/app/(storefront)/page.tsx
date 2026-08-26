import { listCategories } from "@/features/catalog/api/categories.client";
import { listProducts } from "@/features/catalog/api/products.client";
import { CategoryTiles } from "@/features/home/components/CategoryTiles";
import { Hero } from "@/features/home/components/Hero";
import { ProductRail } from "@/features/home/components/ProductRail";
import { Reveal } from "@/features/home/components/Reveal";
import { TrustStrip } from "@/features/home/components/TrustStrip";

/**
 * Focused, real-data homepage (woobe_ui_design_plan.md §8) — hero, trust
 * strip, real categories, one real product rail. Sections needing content
 * that doesn't exist yet (UGC photos, video, "Shop by Vibe," "Build Your
 * Look") are deliberately not built with placeholder content — Week 2+
 * scope per the doc's own notes, see the UI styling plan for the full
 * reasoning.
 */
export default async function HomePage() {
  const [{ categories }, { products }] = await Promise.all([listCategories(), listProducts({ limit: 8 })]);

  return (
    <main>
      <Hero />
      <TrustStrip />
      <Reveal>
        <CategoryTiles categories={categories} />
      </Reveal>
      <Reveal>
        <ProductRail title="New drops" products={products} />
      </Reveal>
    </main>
  );
}
