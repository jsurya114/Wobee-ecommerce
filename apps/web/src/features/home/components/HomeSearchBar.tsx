"use client";

import { useRouter } from "next/navigation";
import { buildProductsHref } from "@/features/catalog/lib/build-products-href";
import { SearchField } from "@/features/catalog/components/SearchField";

/**
 * Persistent, always-visible homepage search (UI refinement pass) — mobile
 * only (`md:hidden`; desktop keeps `SiteHeader`'s inline expanding search,
 * which already has room in the nav and doesn't need this). Sits directly
 * below the header and above the promo carousel so search is reachable
 * without a tap-to-expand step first. Reuses the same `SearchField` as
 * `HeaderSearch` — identical typeahead/submit behaviour, just always open.
 */
export function HomeSearchBar() {
  const router = useRouter();

  return (
    <div className="px-4 pb-2 pt-3 md:hidden">
      <SearchField
        onSubmit={(query) => router.push(buildProductsHref({ q: query || undefined }))}
        onSelectSuggestion={(slug) => router.push(`/products/${slug}`)}
      />
    </div>
  );
}
