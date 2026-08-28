import { z } from "zod";

/**
 * Single source of truth (ADR-020) for the Week 2 Day 4 review request
 * shapes (week2 (1).md §8) — used by apps/web's review form and apps/api's
 * `validate` middleware.
 */

export const submitReviewSchema = z.object({
  productId: z.string().uuid("Invalid product id"),
  rating: z.coerce.number().int().min(1, "Rating must be between 1 and 5").max(5, "Rating must be between 1 and 5"),
  title: z.string().trim().max(150).optional(),
  body: z.string().trim().max(2000).optional(),
});
export type SubmitReviewInput = z.infer<typeof submitReviewSchema>;

// Partial — PATCH semantics, only `rating` and/or the text fields being
// changed need to be sent. `productId` never changes on an edit.
export const updateReviewSchema = z
  .object({
    rating: z.coerce.number().int().min(1, "Rating must be between 1 and 5").max(5, "Rating must be between 1 and 5"),
    title: z.string().trim().max(150),
    body: z.string().trim().max(2000),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: "At least one field is required" });
export type UpdateReviewInput = z.infer<typeof updateReviewSchema>;

export const listReviewsQuerySchema = z.object({
  productId: z.string().uuid("Invalid product id"),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(10),
});
export type ListReviewsQuery = z.infer<typeof listReviewsQuerySchema>;

/** Admin moderation queue filter (week2 (1).md §8's "View, Moderate, Approve/reject/hide"). */
export const listAdminReviewsQuerySchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "HIDDEN"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
export type ListAdminReviewsQuery = z.infer<typeof listAdminReviewsQuerySchema>;
