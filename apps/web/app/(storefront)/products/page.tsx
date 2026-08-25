import { listCategories } from "@/features/catalog/api/categories.client";
import { listProducts } from "@/features/catalog/api/products.client";
import { CategoryFilter } from "@/features/catalog/components/CategoryFilter";
import { ProductGrid } from "@/features/catalog/components/ProductGrid";
import { ApiError } from "@/lib/api-client";

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const { category } = await searchParams;
  const { categories } = await listCategories();

  // An unknown ?category slug 404s at the API — treat it as "no products" rather than crashing the page.
  const products = await listProducts({ category, limit: 24 }).catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 404) {
      return { products: [], page: 1, limit: 24, total: 0 };
    }
    throw error;
  });

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="mb-6 font-display text-2xl text-text-primary">Shop</h1>
      <CategoryFilter categories={categories} activeSlug={category} />
      <ProductGrid products={products.products} />
    </main>
  );
}
