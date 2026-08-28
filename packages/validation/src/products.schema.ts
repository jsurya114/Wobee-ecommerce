import { z } from "zod";

/**
 * Single source of truth for request shapes (ADR-020) — used by apps/web's
 * listing page and apps/api's `validate` middleware. Week 2 Day 7
 * (week2 (1).md §16) adds the admin product-management shapes below the
 * original customer-facing listing-query schema.
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

// ── Week 2 Day 7 admin product-management shapes (week2 (1).md §16) ──

// Same convention Category/Collection slugs already use — see
// collections.schema.ts's own comment on this exact regex.
const slugSchema = z
  .string()
  .trim()
  .min(1, "Slug is required")
  .max(160)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Slug must be lowercase letters, numbers, and hyphens only");

/** A query-string boolean arrives as the literal string "true"/"false", never a real boolean — z.coerce.boolean() would treat the string "false" as truthy and is a known Zod footgun for exactly this shape (same reasoning `booleanFlag()` above already applies, kept separate since that one intentionally has no explicit exported type). */
const queryBooleanSchema = z
  .enum(["true", "false"])
  .optional()
  .transform((value) => (value === undefined ? undefined : value === "true"));

export const createProductSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  slug: slugSchema,
  description: z.string().trim().max(5000).optional(),
  brand: z.string().trim().max(120).optional(),
  categoryId: z.string().uuid("Invalid category id"),
  metaTitle: z.string().trim().max(200).optional(),
  metaDescription: z.string().trim().max(500).optional(),
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200).optional(),
  slug: slugSchema.optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  brand: z.string().trim().max(120).nullable().optional(),
  categoryId: z.string().uuid("Invalid category id").optional(),
  metaTitle: z.string().trim().max(200).nullable().optional(),
  metaDescription: z.string().trim().max(500).nullable().optional(),
});
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const setProductActiveSchema = z.object({ isActive: z.boolean() });
export type SetProductActiveInput = z.infer<typeof setProductActiveSchema>;

export const createVariantSchema = z.object({
  // Not required from the client — POST /admin/products/:id/variants takes
  // the product id from the URL, always overriding whatever (if anything)
  // is sent here, so the URL stays the single authoritative source.
  productId: z.string().uuid("Invalid product id").optional(),
  sku: z.string().trim().min(1, "SKU is required").max(64),
  color: z.string().trim().min(1, "Colour is required").max(60),
  size: z.string().trim().min(1, "Size is required").max(30),
  weightGrams: z.coerce.number().int().positive("Weight must be a positive number of grams"),
  ratePerKgOverridePaise: z.coerce.number().int().positive().nullable().optional(),
  fabric: z.string().trim().max(200).nullable().optional(),
  fit: z.string().trim().max(200).nullable().optional(),
  measurements: z.string().trim().max(500).nullable().optional(),
  /** Starting stock for the new variant's Inventory row — 0 if omitted (see InitializeInventoryForVariantUseCase's own doc comment). */
  initialQuantity: z.coerce.number().int().min(0).optional(),
});
export type CreateVariantInput = z.infer<typeof createVariantSchema>;

export const updateVariantSchema = z.object({
  sku: z.string().trim().min(1, "SKU is required").max(64).optional(),
  color: z.string().trim().min(1, "Colour is required").max(60).optional(),
  size: z.string().trim().min(1, "Size is required").max(30).optional(),
  weightGrams: z.coerce.number().int().positive("Weight must be a positive number of grams").optional(),
  ratePerKgOverridePaise: z.coerce.number().int().positive().nullable().optional(),
  fabric: z.string().trim().max(200).nullable().optional(),
  fit: z.string().trim().max(200).nullable().optional(),
  measurements: z.string().trim().max(500).nullable().optional(),
});
export type UpdateVariantInput = z.infer<typeof updateVariantSchema>;

export const setVariantActiveSchema = z.object({ isActive: z.boolean() });
export type SetVariantActiveInput = z.infer<typeof setVariantActiveSchema>;

export const addProductImageSchema = z.object({
  url: z.string().trim().url("Invalid image URL").max(2000),
  altText: z.string().trim().min(1, "Alt text is required for accessibility").max(200),
});
export type AddProductImageInput = z.infer<typeof addProductImageSchema>;

export const reorderProductImagesSchema = z.object({
  imageIds: z.array(z.string().uuid("Invalid image id")).min(1, "At least one image id is required"),
});
export type ReorderProductImagesInput = z.infer<typeof reorderProductImagesSchema>;

export const listProductsAdminQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  categoryId: z.string().uuid().optional(),
  isActive: queryBooleanSchema,
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
export type ListProductsAdminQuery = z.infer<typeof listProductsAdminQuerySchema>;
