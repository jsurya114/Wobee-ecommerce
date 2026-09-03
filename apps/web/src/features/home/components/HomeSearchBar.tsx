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
 *
 * Styled as a minimal pill (client-review reference, 2026-09-03) — a soft
 * flat fill and fully rounded ends instead of the default bordered
 * rounded-rect `Input`, matching the reference mock without touching the
 * shared `Input` primitive every other form field on the site still uses.
 */
export function HomeSearchBar() {
  const router = useRouter();

  return (
    <div className="px-4 pb-2 pt-3 md:hidden">
      <SearchField
        inputClassName="h-12 rounded-full border-transparent bg-surface-2"
        onSubmit={(query) => router.push(buildProductsHref({ q: query || undefined }))}
        onSelectSuggestion={(slug) => router.push(`/products/${slug}`)}
      />
    </div>
  );
}
