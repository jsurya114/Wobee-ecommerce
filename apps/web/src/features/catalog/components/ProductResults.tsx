"use client";

import { useState } from "react";
import { Button } from "@woobe/ui";
import { listProducts, type ProductListParams, type ProductSummary } from "../api/products.client";
import { ProductGrid } from "./ProductGrid";

/**
 * Result count + grid + "Load more" (Week 2 Day 1's "Pagination/infinite
 * loading" bullet). This is a UI-only treatment layered on the existing
 * offset pagination (page/limit, capped at 50) rather than a cursor-based
 * rework: the catalogue is nowhere near ADR-012's own scaling trigger (50k
 * products / p95 > 300ms), offset pagination is already correct and
 * server-authoritative here, and "load more" only needs to keep asking for
 * the next page — it doesn't need cursor stability guarantees a
 * fast-changing feed would. Revisit only if that trigger is ever hit.
 *
 * The parent Server Component (app/(storefront)/products/page.tsx) gives
 * this a `key` derived from the full query string, so a filter/search/sort
 * change — a fresh server render with fresh initial props — remounts this
 * component instead of it hanging on to a previous filter's accumulated
 * pages.
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
  const [products, setProducts] = useState(initialProducts);
  const [page, setPage] = useState(initialPage);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const hasMore = products.length < initialTotal;

  async function loadMore() {
    setIsLoadingMore(true);
    try {
      const nextPage = page + 1;
      const result = await listProducts({ ...query, page: nextPage, limit });
      setProducts((prev) => [...prev, ...result.products]);
      setPage(nextPage);
    } finally {
      setIsLoadingMore(false);
    }
  }

  return (
    <div>
      <p className="mb-4 font-body text-sm text-text-secondary" role="status">
        {initialTotal === 0
          ? hasActiveFilters
            ? "No products match your filters."
            : "No products found."
          : `Showing ${products.length} of ${initialTotal} product${initialTotal === 1 ? "" : "s"}`}
      </p>

      <ProductGrid products={products} />

      {hasMore ? (
        <div className="mt-8 flex justify-center">
          <Button type="button" variant="secondary" onClick={loadMore} isLoading={isLoadingMore}>
            Load more
          </Button>
        </div>
      ) : null}
    </div>
  );
}
