"use client";

import { Button } from "@woobe/ui";
import { useState, type ReactNode } from "react";
import { listProducts, type ProductListParams, type ProductSummary } from "../api/products.client";
import { ProductGrid } from "./ProductGrid";

/**
 * Owns only the "Load more" interaction — the result-count text (it has to
 * live here, not in the server-rendered `ProductResults`, because it grows
 * as more pages are fetched), fetching subsequent pages, and appending them
 * below the initial grid. `children` is the already server-rendered initial
 * `ProductGrid` from `ProductResults`, passed straight through untouched —
 * this component never imports or maps over the initial products itself, so
 * that first page's `ProductCard`s never enter this client boundary.
 * Products loaded via "Load more" are necessarily client-rendered (they only
 * exist after a client-side fetch) — reusing `ProductGrid` for them keeps
 * that markup identical to the server-rendered initial page.
 *
 * Remounted (fresh state) whenever the parent `ProductResults`'s key
 * changes — see that component's own doc comment.
 */
export function LoadMoreProducts({
  children,
  initialCount,
  initialTotal,
  initialPage,
  limit,
  query,
}: {
  children: ReactNode;
  initialCount: number;
  initialTotal: number;
  initialPage: number;
  limit: number;
  query: Omit<ProductListParams, "page" | "limit">;
}) {
  const [appended, setAppended] = useState<ProductSummary[]>([]);
  const [page, setPage] = useState(initialPage);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const shownCount = initialCount + appended.length;
  const hasMore = shownCount < initialTotal;

  async function loadMore() {
    setIsLoadingMore(true);
    try {
      const nextPage = page + 1;
      const result = await listProducts({ ...query, page: nextPage, limit });
      setAppended((prev) => [...prev, ...result.products]);
      setPage(nextPage);
    } finally {
      setIsLoadingMore(false);
    }
  }

  return (
    <div>
      <p className="mb-4 font-body text-sm text-text-secondary" role="status">
        {`Showing ${shownCount} of ${initialTotal} product${initialTotal === 1 ? "" : "s"}`}
      </p>

      {children}

      {appended.length > 0 ? (
        <div className="mt-4">
          <ProductGrid products={appended} />
        </div>
      ) : null}

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
