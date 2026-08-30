"use client";

import { useRouter } from "next/navigation";
import { buildProductsHref, type ProductsQueryParams } from "../lib/build-products-href";
import { SearchField } from "./SearchField";

/**
 * PLP search (ADR-012) — wraps the shared `SearchField` with the
 * products-page context: submitting preserves every other active filter and
 * drops `page` (a new term invalidates the old page number). Typing shows a
 * debounced typeahead; picking a suggestion jumps straight to that product.
 * `SearchField` re-syncs its input from `currentParams.q` when that changes
 * for a reason other than its own submit (e.g. "Clear filters").
 */
export function SearchBar({ currentParams }: { currentParams: ProductsQueryParams }) {
  const router = useRouter();

  return (
    <div className="mb-4">
      <SearchField
        initialQuery={currentParams.q ?? ""}
        onSubmit={(query) => router.push(buildProductsHref({ ...currentParams, q: query || undefined }))}
        onSelectSuggestion={(slug) => router.push(`/products/${slug}`)}
      />
    </div>
  );
}
