import { z } from "zod";

/**
 * Single source of truth (ADR-020) for the store-level testimonial request
 * shapes (2026-09-11, replaces reviews.schema.ts) — used by apps/web's
 * testimonial submission form and apps/api's `validate` middleware.
 *
 * Submitted as multipart/form-data (rating/text alongside up to 3 image
 * files) rather than JSON — multer parses the text fields into strings, so
 * `rating` needs `z.coerce` the same way the old review schema's did.
 */

export const submitTestimonialSchema = z.object({
  orderId: z.string().uuid("Invalid order id"),
  rating: z.coerce.number().int().min(1, "Rating must be between 1 and 5").max(5, "Rating must be between 1 and 5"),
  text: z
    .string()
    .trim()
    .min(10, "Tell us a little more about your experience (at least 10 characters)")
    .max(2000, "That's a bit long — please keep it under 2000 characters"),
});
export type SubmitTestimonialInput = z.infer<typeof submitTestimonialSchema>;

/** Admin moderation queue filter. */
export const listAdminTestimonialsQuerySchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
export type ListAdminTestimonialsQuery = z.infer<typeof listAdminTestimonialsQuerySchema>;
