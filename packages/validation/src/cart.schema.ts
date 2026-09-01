import { z } from "zod";

/**
 * Single source of truth for request shapes (ADR-020) — used by apps/web's
 * cart UI and apps/api's `validate` middleware. Deliberately accepts ONLY
 * variantId + quantity: price/subtotal are never client-supplied fields, so
 * there's nothing here for a tampered client value to override
 * (DEVELOPMENT_RULES.md #1) — Zod strips any extra keys a tampered request
 * body includes since these schemas aren't `.passthrough()`.
 */

// A cart line is a single variant added many times, not N rows of qty 1 —
// cap at 20 to keep it a sane number for a fashion storefront, not a
// wholesale order; matches Definition of Done's "server ignores tampering" bar.
export const addCartItemSchema = z.object({
  variantId: z.string().uuid("Invalid variant id"),
  quantity: z.coerce.number().int().min(1, "Quantity must be at least 1").max(20, "Quantity cannot exceed 20"),
});
export type AddCartItemInput = z.infer<typeof addCartItemSchema>;

export const updateCartItemSchema = z.object({
  quantity: z.coerce.number().int().min(1, "Quantity must be at least 1").max(20, "Quantity cannot exceed 20"),
});
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;

// Cart "change size" — swaps a line to a different variant of the same
// product; quantity/stock revalidation happens server-side, not here.
export const changeCartItemVariantSchema = z.object({
  variantId: z.string().uuid("Invalid variant id"),
});
export type ChangeCartItemVariantInput = z.infer<typeof changeCartItemVariantSchema>;
