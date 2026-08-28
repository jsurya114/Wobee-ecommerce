import { z } from "zod";

/** Single source of truth (ADR-020) for Week 2 Day 7's admin inventory request shapes (week2 (1).md §15). */

const queryBooleanSchema = z
  .enum(["true", "false"])
  .optional()
  .transform((value) => (value === undefined ? undefined : value === "true"));

export const adjustInventorySchema = z.object({
  /** Signed — positive restocks, negative deducts (e.g. correcting a damaged-stock miscount). Zero is rejected: not a real adjustment, and would otherwise write a no-op audit log entry. */
  delta: z.coerce.number().int().refine((value) => value !== 0, "Adjustment must be non-zero"),
  reason: z.string().trim().min(3, "A reason is required for every manual adjustment").max(500),
});
export type AdjustInventoryInput = z.infer<typeof adjustInventorySchema>;

export const listInventoryAdminQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  lowStockOnly: queryBooleanSchema,
  outOfStockOnly: queryBooleanSchema,
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
export type ListInventoryAdminQuery = z.infer<typeof listInventoryAdminQuerySchema>;
