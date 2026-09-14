import { z } from "zod";

/**
 * Admin offer management (Phase 2, 2026-09-14) — single source of truth
 * for the create/update request shapes (ADR-020), same split as
 * coupons.schema.ts: shape-only validation here (types, ranges that don't
 * depend on another field), cross-field business rules (percentage 1-100,
 * endsAt-after-startsAt, scope/target consistency) live once in
 * `validateOfferInput` (apps/api's offers domain) so create and update —
 * which resolves a partial patch against the EXISTING row first — enforce
 * the exact same rule against the final value, not just whatever one
 * request happened to include.
 */
const offerDiscountTypeSchema = z.enum(["PERCENTAGE", "FIXED_AMOUNT"]);
const offerScopeSchema = z.enum(["ALL_PRODUCTS", "CATEGORY", "PRODUCTS"]);

export const createOfferSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  description: z.string().trim().max(1000).optional(),
  discountType: offerDiscountTypeSchema,
  /** Percent (1-100) for PERCENTAGE, paise for FIXED_AMOUNT — see OfferEntity's own comment on this dual meaning. */
  discountValue: z.coerce.number().int().positive("Enter a positive value"),
  scope: offerScopeSchema,
  /** Required (and only meaningful) when scope is CATEGORY — enforced by validateOfferInput, not here. */
  categoryId: z.string().uuid("Invalid category id").nullable().optional(),
  /** Required (and only meaningful) when scope is PRODUCTS — enforced by validateOfferInput, not here. */
  productIds: z.array(z.string().uuid("Invalid product id")).optional(),
  /** Tie-breaker among same-scope offers matching the same product — defaults to 0 (most offers never need to set this). */
  priority: z.coerce.number().int().min(0).optional(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
});
export type CreateOfferInput = z.infer<typeof createOfferSchema>;

export const updateOfferSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  discountType: offerDiscountTypeSchema.optional(),
  discountValue: z.coerce.number().int().positive("Enter a positive value").optional(),
  scope: offerScopeSchema.optional(),
  categoryId: z.string().uuid("Invalid category id").nullable().optional(),
  productIds: z.array(z.string().uuid("Invalid product id")).optional(),
  priority: z.coerce.number().int().min(0).optional(),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional(),
});
export type UpdateOfferInput = z.infer<typeof updateOfferSchema>;

export const setOfferActiveSchema = z.object({ isActive: z.boolean() });
export type SetOfferActiveInput = z.infer<typeof setOfferActiveSchema>;
