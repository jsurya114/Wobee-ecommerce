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

export const createCategorySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  slug: slugSchema,
  imageUrl: z.string().trim().url("Invalid image URL").nullable().optional(),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120).optional(),
  slug: slugSchema.optional(),
  imageUrl: z.string().trim().url("Invalid image URL").nullable().optional(),
});
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const setCategoryActiveSchema = z.object({ isActive: z.boolean() });
export type SetCategoryActiveInput = z.infer<typeof setCategoryActiveSchema>;

export const reorderCategoriesSchema = z.object({
  categoryIds: z.array(z.string().uuid("Invalid category id")).min(1, "At least one category id is required"),
});
export type ReorderCategoriesInput = z.infer<typeof reorderCategoriesSchema>;
