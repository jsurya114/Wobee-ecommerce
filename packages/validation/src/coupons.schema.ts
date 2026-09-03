import { z } from "zod";

/** Single source of truth (ADR-020) for the Week 2 Day 5 "apply coupon" request shape (week2 (1).md §9). */
export const applyCouponSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(1, "Enter a coupon code")
    .max(50),
});
export type ApplyCouponInput = z.infer<typeof applyCouponSchema>;

/**
 * Admin coupon management (2026-09-03) — single source of truth for the
 * create/update request shapes. Shape-only validation here (types, ranges
 * that don't depend on another field's value); the cross-field business
 * rules (percentage 1-100, expiry-after-start, per-user-limit-vs-usage-limit,
 * maxDiscount-is-percentage-only) live once in `validateCouponInput`
 * (apps/api's coupons domain) so create and update — which resolves a
 * partial patch against the EXISTING row first — enforce the exact same
 * rule against the final value, not just whatever one request happened to
 * include.
 */
const couponCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(3, "Code must be at least 3 characters")
  .max(50)
  .regex(/^[A-Z0-9_-]+$/, "Code may only contain letters, numbers, hyphens, and underscores");

export const createCouponSchema = z.object({
  code: couponCodeSchema,
  type: z.enum(["PERCENTAGE", "FLAT"]),
  /** Percent (1-100) for PERCENTAGE, paise for FLAT — matches Coupon.value's own dual meaning (see CouponEntity's comment). */
  value: z.coerce.number().int().positive("Enter a positive value"),
  minCartValuePaise: z.coerce.number().int().nonnegative().nullable().optional(),
  maxDiscountPaise: z.coerce.number().int().positive().nullable().optional(),
  usageLimit: z.coerce.number().int().positive().nullable().optional(),
  perUserLimit: z.coerce.number().int().positive().nullable().optional(),
  validFrom: z.coerce.date(),
  validTo: z.coerce.date(),
});
export type CreateCouponInput = z.infer<typeof createCouponSchema>;

export const updateCouponSchema = z.object({
  code: couponCodeSchema.optional(),
  type: z.enum(["PERCENTAGE", "FLAT"]).optional(),
  value: z.coerce.number().int().positive("Enter a positive value").optional(),
  minCartValuePaise: z.coerce.number().int().nonnegative().nullable().optional(),
  maxDiscountPaise: z.coerce.number().int().positive().nullable().optional(),
  usageLimit: z.coerce.number().int().positive().nullable().optional(),
  perUserLimit: z.coerce.number().int().positive().nullable().optional(),
  validFrom: z.coerce.date().optional(),
  validTo: z.coerce.date().optional(),
});
export type UpdateCouponInput = z.infer<typeof updateCouponSchema>;

export const setCouponActiveSchema = z.object({ isActive: z.boolean() });
export type SetCouponActiveInput = z.infer<typeof setCouponActiveSchema>;
