import { listCollections } from "@/features/catalog/api/collections.client";
import { listCategories } from "@/features/catalog/api/categories.client";
import { listProducts, PRODUCT_SORT_VALUES, type ProductListParams, type ProductListResult, type ProductSort } from "@/features/catalog/api/products.client";
import { CategoryFilter } from "@/features/catalog/components/CategoryFilter";
import { CollectionFilter } from "@/features/catalog/components/CollectionFilter";
import { FiltersPanel } from "@/features/catalog/components/FiltersPanel";
import { ProductResults } from "@/features/catalog/components/ProductResults";
import { SearchBar } from "@/features/catalog/components/SearchBar";
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
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="mb-6 font-display text-2xl text-text-primary">Shop</h1>
      <SearchBar currentParams={currentParams} />
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
