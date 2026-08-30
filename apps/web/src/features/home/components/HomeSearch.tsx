"use client";

import { useRouter } from "next/navigation";
import { buildProductsHref } from "@/features/catalog/lib/build-products-href";
import { SearchField } from "@/features/catalog/components/SearchField";

/**
 * Persistent search field directly under the header on the homepage
 * (redesign spec §B/§J). Typing shows a debounced typeahead; submitting
 * routes to `/products?q=…`, and picking a suggestion jumps to that product.
 * Backend search is unchanged.
 */
export function HomeSearch() {
  const router = useRouter();
  return (
    <div className="px-4 pt-3 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <SearchField
          onSubmit={(query) => router.push(buildProductsHref({ q: query || undefined }))}
          onSelectSuggestion={(slug) => router.push(`/products/${slug}`)}
        />
      </div>
    </div>
  );
}
