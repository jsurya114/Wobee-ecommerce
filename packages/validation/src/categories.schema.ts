import { z } from "zod";

/**
 * Single source of truth (ADR-020) for the admin category-management
 * request shapes — same conventions as products.schema.ts's slug/name
 * fields. Slug is required on create (the client always sends the live
 * auto-generated preview) but the server remains authoritative:
 * resolveUniqueSlug canonicalizes and de-duplicates whatever is submitted.
 */
const slugSchema = z
  .string()
  .trim()
  .min(1, "Slug is required")
  .max(120)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Slug must be lowercase letters, numbers, and hyphens only");

// Accepts either an absolute URL (a real admin upload, via the media
// endpoint) or an app-relative path (every seed-era category image —
// `/imgs/cat-*.jpg`, resolved against apps/web's own public/ directory by
// the admin's resolveImageUrl helper, same as products/banners). A plain
// `.url()` check rejects the latter, which — since CategoryForm always
// round-trips the category's current imageUrl on every save, not just when
// the image itself changes — made every edit to any seed-era category
// (name, slug, anything) fail 400 "Invalid image URL", not only image
// changes. Found live while verifying the stale-detail-page fix.
const categoryImageUrlSchema = z
  .string()
  .trim()
  .refine((value) => /^https?:\/\//.test(value) || value.startsWith("/"), "Invalid image URL")
  .nullable()
  .optional();

export const createCategorySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  slug: slugSchema,
  imageUrl: categoryImageUrlSchema,
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120).optional(),
  slug: slugSchema.optional(),
  imageUrl: categoryImageUrlSchema,
});
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const setCategoryActiveSchema = z.object({ isActive: z.boolean() });
export type SetCategoryActiveInput = z.infer<typeof setCategoryActiveSchema>;

export const reorderCategoriesSchema = z.object({
  categoryIds: z.array(z.string().uuid("Invalid category id")).min(1, "At least one category id is required"),
});
export type ReorderCategoriesInput = z.infer<typeof reorderCategoriesSchema>;
