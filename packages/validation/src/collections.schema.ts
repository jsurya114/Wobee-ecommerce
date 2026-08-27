import { z } from "zod";

/**
 * Single source of truth (ADR-020) for the admin collection-management
 * request shapes — used by apps/admin's forms (Week 2 Day 7's product-
 * picker UI, deferred — see collections.module.ts's own doc comment) and
 * apps/api's `validate` middleware.
 */

// Lowercase, hyphen-separated — same convention Category/Product slugs
// already use across the seed data, kept consistent for URL predictability.
const slugSchema = z
  .string()
  .trim()
  .min(1, "Slug is required")
  .max(120)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Slug must be lowercase letters, numbers, and hyphens only");

export const createCollectionSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  slug: slugSchema,
  description: z.string().trim().max(2000).optional(),
});
export type CreateCollectionInput = z.infer<typeof createCollectionSchema>;

export const updateCollectionSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120).optional(),
  slug: slugSchema.optional(),
  description: z.string().trim().max(2000).nullable().optional(),
});
export type UpdateCollectionInput = z.infer<typeof updateCollectionSchema>;

export const setCollectionActiveSchema = z.object({
  isActive: z.boolean(),
});
export type SetCollectionActiveInput = z.infer<typeof setCollectionActiveSchema>;

export const assignCollectionProductSchema = z.object({
  productId: z.string().uuid("Invalid product id"),
});
export type AssignCollectionProductInput = z.infer<typeof assignCollectionProductSchema>;

export const reorderCollectionProductsSchema = z.object({
  productIds: z.array(z.string().uuid("Invalid product id")).min(1, "At least one product id is required"),
});
export type ReorderCollectionProductsInput = z.infer<typeof reorderCollectionProductsSchema>;
