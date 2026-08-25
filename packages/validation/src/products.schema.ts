import { z } from "zod";

/**
 * Single source of truth for request shapes (ADR-020) — used by apps/web's
 * listing page and apps/api's `validate` middleware.
 */

export const productListQuerySchema = z.object({
  category: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  // Capped at 50 — a client can't force an unbounded page size (basic
  // resource-exhaustion guard until real search/pagination lands in ADR-012's
  // "future scaling" trigger).
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type ProductListQuery = z.infer<typeof productListQuerySchema>;
