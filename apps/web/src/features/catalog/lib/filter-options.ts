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
 */
export const SORT_OPTIONS: { value: ProductSort; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
];
