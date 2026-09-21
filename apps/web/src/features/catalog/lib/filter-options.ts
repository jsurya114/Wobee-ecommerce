import { LIQUID_GLASS_SURFACE_CLASS } from "@/lib/liquid-glass";
import type { ProductSort } from "../api/products.client";

/**
 * The curated size pill set (redesign spec §13/§14) — apparel sizing is a
 * small, standard set (see the journal's note on why color stayed a
 * free-text facet instead: it isn't). Shared by `SizeQuickFilter` and
 * `FiltersPanel` so the two surfaces can never drift on what "size" means.
 */
export const SIZE_OPTIONS = ["XS", "S", "M", "L", "XL", "XXL", "One Size"];

/**
 * Only sorts the backend actually implements (`productSortValues` in
 * @woobe/validation, each with its own DB index — see
 * ProductRepository.buildOrderBy). No "Recommended" or "Weight" entries:
 * there's no ranking signal or cached representative-weight column behind
 * either yet, and a fake client-side sort would silently stop working once
 * "Load more" pages in beyond what's already fetched.
 *
 * `shortLabel` is only for the compact PLP control-bar trigger button
 * (mobile UI refinement pass 2026-09-01) — the sort sheet itself always
 * lists the full `label`.
 */
export const SORT_OPTIONS: { value: ProductSort; label: string; shortLabel: string }[] = [
  { value: "newest", label: "Newest", shortLabel: "Newest" },
  { value: "price_asc", label: "Price: Low to High", shortLabel: "Price Low" },
  { value: "price_desc", label: "Price: High to Low", shortLabel: "Price High" },
];

/**
 * Shared visual treatment for the PLP's Size/Filters/Sort trigger buttons
 * (mobile UI refinement pass 2026-09-01) — compact enough that all three
 * fit on one row at 375–390px without wrapping, while `after:` grows the
 * actual hit target back out to the ~44px minimum via an invisible
 * pseudo-element rather than the visible box (WCAG target-size allows a
 * larger *hit* area to satisfy the minimum without the control looking
 * oversized). Vertical-only expansion — widening horizontally too would
 * overlap the next button's hit area in this same tightly-packed row. (`after:`, not `before:` — `before:` is
 * the glass surface's sheen layer, see `PLP_CONTROL_INACTIVE_CLASS`.)
 */
export const PLP_CONTROL_BUTTON_CLASS =
  "relative inline-flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-pill border px-2.5 font-body text-xs transition-colors after:absolute after:-inset-y-1.5 after:inset-x-0 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1";

/**
 * Resting (nothing-selected) look for those same triggers: the shared
 * liquid-glass surface `CompactSearchBar` and `BottomNav` wear
 * (`lib/liquid-glass.ts`), so Size/Offer/Filters/Sort read as one family with
 * the search pill above them. A selected trigger keeps its solid `bg-primary`
 * fill instead — that fill is the "this filter is active" signal, and glass
 * would blur it away. `isolate` + `before:-z-10` tuck the sheen layer under
 * the button's own icon and label (the surface class expects the consumer to
 * position its content above it; a plain button's children can't be).
 */
export const PLP_CONTROL_INACTIVE_CLASS = `${LIQUID_GLASS_SURFACE_CLASS} isolate before:-z-10 text-text-primary hover:border-primary`;
