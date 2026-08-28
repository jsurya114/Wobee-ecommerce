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
