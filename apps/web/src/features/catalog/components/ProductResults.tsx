import { EmptyState } from "@woobe/ui";
import { PackageSearch } from "lucide-react";
import type { ProductListParams, ProductSummary } from "../api/products.client";
import { LoadMoreProducts } from "./LoadMoreProducts";
import { ProductGrid } from "./ProductGrid";

/**
 * Result count + grid + "Load more" (Week 2 Day 1's "Pagination/infinite
 * loading" bullet). Server Component — the initial page's `ProductGrid` is
 * rendered here directly (server HTML, no client hydration for those cards),
 * and only the "Load more" interaction itself (result-count text, fetching
 * subsequent pages, appending them) lives in the small client
 * `LoadMoreProducts` island below (2026-09-02 perf audit fix; previously
 * this whole component, initial cards included, was client-rendered).
 *
 * The parent Server Component (app/(storefront)/products/page.tsx) gives
 * this a `key` derived from the full query string, so a filter/search/sort
 * change — a fresh server render with fresh initial props — remounts the
 * nested `LoadMoreProducts` client island instead of it hanging on to a
 * previous filter's accumulated pages.
 */
export function ProductResults({
  initialProducts,
  initialTotal,
  initialPage,
  limit,
  query,
  hasActiveFilters,
}: {
  initialProducts: ProductSummary[];
  initialTotal: number;
  initialPage: number;
  limit: number;
  query: Omit<ProductListParams, "page" | "limit">;
  hasActiveFilters: boolean;
}) {
  if (initialTotal === 0) {
    return (
      <div role="status">
        <EmptyState
          icon={<PackageSearch strokeWidth={1.25} aria-hidden="true" />}
          title={hasActiveFilters ? "No products match your filters." : "No products found."}
          description={hasActiveFilters ? "Try widening your price range or clearing a filter." : undefined}
        />
      </div>
    );
  }

  return (
    <LoadMoreProducts initialCount={initialProducts.length} initialTotal={initialTotal} initialPage={initialPage} limit={limit} query={query}>
      <ProductGrid products={initialProducts} />
    </LoadMoreProducts>
  );
}
