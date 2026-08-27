import { z } from "zod";

/**
 * Single source of truth for request shapes (ADR-020) — used by apps/web's
 * listing page and apps/api's `validate` middleware.
 */

/**
 * Comma-separated multi-value query params (`?size=M,L`) — a single
 * repeatable value per param name, not `size=M&size=L`, so a plain `<a href>`
 * link (no client JS) can express "any of these" without relying on
 * Express's array-of-repeated-keys query parsing. Dedupes and drops blanks;
 * `undefined` (not `[]`) when nothing usable was supplied, so "no filter"
 * and "filter matching nothing" stay distinguishable downstream.
 */
function commaSeparatedList() {
  return z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return undefined;
      const values = Array.from(new Set(val.split(",").map((v) => v.trim()).filter(Boolean)));
      return values.length > 0 ? values : undefined;
    });
}

/** `?inStock=true` / `?inStock=false` — anything else (missing, typo'd) is "no filter", not an error, since this is a display refinement, not a security-relevant flag. */
function booleanFlag() {
  return z
    .enum(["true", "false"])
    .optional()
    .transform((val) => (val === undefined ? undefined : val === "true"));
}

export const productSortValues = ["price_asc", "price_desc", "newest"] as const;
export type ProductSort = (typeof productSortValues)[number];

export const productListQuerySchema = z
  .object({
    category: z.string().trim().min(1).optional(),
    // Day 1 scope: filter-by-collection only (GET /api/v1/collections is
    // listing-only too) — collection detail pages/rails are Day 2.
    collection: z.string().trim().min(1).optional(),
    // Advanced search (ADR-012): matched against product name via a
    // pg_trgm-backed ILIKE — see ListProductsUseCase's own comment for why
    // this doesn't need raw SQL in the query path itself.
    q: z.string().trim().min(1).max(100).optional(),
    // Variant-level facets (ProductVariant.size/.color) — independent
    // facets, not requiring the same variant to match both when combined
    // (see ListProductsUseCase's own doc comment).
    size: commaSeparatedList(),
    color: commaSeparatedList(),
    // Live availability filter — never a stale/cached flag, see
    // ListProductsUseCase.
    inStock: booleanFlag(),
    // Paise, inclusive bounds. Filters against Product.minPricePaiseCache —
    // the same display/sort cache Week 1 already uses for listing sort
    // (see product.repository.ts's own comment for why that's fine for a
    // listing filter, vs. checkout which never reads it).
    minPrice: z.coerce.number().int().min(0).optional(),
    maxPrice: z.coerce.number().int().min(0).optional(),
    sort: z.enum(productSortValues).default("price_asc"),
    page: z.coerce.number().int().min(1).default(1),
    // Capped at 50 — a client can't force an unbounded page size (basic
    // resource-exhaustion guard; ADR-012's "future scaling" trigger is the
    // bar for anything heavier, e.g. cursor pagination).
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .refine((data) => data.minPrice === undefined || data.maxPrice === undefined || data.minPrice <= data.maxPrice, {
    message: "minPrice must not exceed maxPrice",
    path: ["minPrice"],
  });
export type ProductListQuery = z.infer<typeof productListQuerySchema>;
