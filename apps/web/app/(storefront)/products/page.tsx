import type { Metadata } from "next";
import { listCollections } from "@/features/catalog/api/collections.client";
import { listCategories } from "@/features/catalog/api/categories.client";
import { listProducts, PRODUCT_SORT_VALUES, type ProductListParams, type ProductListResult, type ProductSort } from "@/features/catalog/api/products.client";
import { CategoryFilter } from "@/features/catalog/components/CategoryFilter";
import { CollectionFilter } from "@/features/catalog/components/CollectionFilter";
import { FiltersPanel } from "@/features/catalog/components/FiltersPanel";
import { ProductResults } from "@/features/catalog/components/ProductResults";
import type { ProductsQueryParams } from "@/features/catalog/lib/build-products-href";
import { ApiError } from "@/lib/api-client";

// Reads searchParams — already renders dynamically without needing an
// explicit `dynamic` export (ADR-026's rule: any page reading live
// catalogue/pricing data per-request, not build-time-static).
type RawSearchParams = Record<string, string | string[] | undefined>;

const PAGE_LIMIT = 24;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseSort(value: string | undefined): ProductSort {
  return (PRODUCT_SORT_VALUES as readonly string[]).includes(value ?? "") ? (value as ProductSort) : "price_asc";
}

/**
 * Week 2 Day 9 (week2 (1).md §19) — this app has no separate `/categories/
 * [slug]` route (category filtering has been `/products?category=` since
 * Week 2 Day 1), so a category-filtered view gets a real title + a
 * self-canonical URL scoped to just `?category=`, dropping every other
 * filter param (price/size/color/sort/search/page): those are refinements
 * of the same listing, not distinct pages worth splitting ranking signal
 * across. A collection-filtered view instead canonicalizes to
 * `/collections/[slug]` — that page already exists and shows the same
 * products, so `?collection=` here is a duplicate view of it, not a
 * separate canonical one. A search (`?q=`) gets `noindex, follow`: query
 * strings are unbounded and not something worth asking search engines to
 * index, but links found on the page (to real product/category pages)
 * should still be followed.
 */
export async function generateMetadata({ searchParams }: { searchParams: Promise<RawSearchParams> }): Promise<Metadata> {
  const raw = await searchParams;
  const categorySlug = first(raw.category);
  const collectionSlug = first(raw.collection);
  const q = first(raw.q);

  if (q) {
    return { title: `Search: ${q}`, robots: { index: false, follow: true } };
  }

  if (collectionSlug) {
    return { alternates: { canonical: `/collections/${collectionSlug}` } };
  }

  if (categorySlug) {
    const { categories } = await listCategories();
    const category = categories.find((c) => c.slug === categorySlug);
    const title = category ? category.name : "Shop";
    return {
      title,
      description: category ? `Shop ${category.name} at Woobe — fashion, by weight.` : undefined,
      alternates: { canonical: `/products?category=${encodeURIComponent(categorySlug)}` },
      openGraph: { title },
    };
  }

  return { title: "Shop", alternates: { canonical: "/products" } };
}

export default async function ProductsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const raw = await searchParams;

  const currentParams: ProductsQueryParams = {
    category: first(raw.category),
    collection: first(raw.collection),
    q: first(raw.q),
    size: first(raw.size),
    color: first(raw.color),
    inStock: first(raw.inStock) === "true" ? "true" : undefined,
    minPrice: first(raw.minPrice),
    maxPrice: first(raw.maxPrice),
    sort: parseSort(first(raw.sort)),
  };

  const query: Omit<ProductListParams, "page" | "limit"> = {
    category: currentParams.category,
    collection: currentParams.collection,
    q: currentParams.q,
    size: currentParams.size ? currentParams.size.split(",") : undefined,
    color: currentParams.color ? currentParams.color.split(",") : undefined,
    inStock: currentParams.inStock === "true" ? true : undefined,
    minPrice: currentParams.minPrice ? Number(currentParams.minPrice) : undefined,
    maxPrice: currentParams.maxPrice ? Number(currentParams.maxPrice) : undefined,
    sort: currentParams.sort as ProductSort,
  };

  const [{ categories }, { collections }] = await Promise.all([listCategories(), listCollections()]);

  // An unknown ?category/?collection slug 404s at the API — treat it as "no
  // products" rather than crashing the page (same as Week 1's original
  // category-only handling).
  const emptyResult: ProductListResult = { products: [], page: 1, limit: PAGE_LIMIT, total: 0 };
  const result = await listProducts({ ...query, limit: PAGE_LIMIT }).catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 404) {
      return emptyResult;
    }
    throw error;
  });

  const hasActiveFilters = Boolean(
    currentParams.q || currentParams.size || currentParams.color || currentParams.inStock || currentParams.minPrice || currentParams.maxPrice,
  );

  // Remounts ProductResults (and its accumulated "load more" pages) fresh
  // whenever the filter/sort/search state actually changes — see that
  // component's own doc comment.
  const resultsKey = JSON.stringify({ ...query, category: currentParams.category, collection: currentParams.collection });

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <h1 className="mb-4 font-display text-xl text-text-primary">Shop</h1>
      <CategoryFilter categories={categories} activeSlug={currentParams.category} currentParams={currentParams} />
      <CollectionFilter collections={collections} activeSlug={currentParams.collection} currentParams={currentParams} />
      <FiltersPanel currentParams={currentParams} />
      <ProductResults
        key={resultsKey}
        initialProducts={result.products}
        initialTotal={result.total}
        initialPage={result.page}
        limit={PAGE_LIMIT}
        query={query}
        hasActiveFilters={hasActiveFilters}
      />
    </main>
  );
}
