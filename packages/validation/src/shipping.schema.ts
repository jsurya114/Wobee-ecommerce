import { z } from "zod";

/** Single source of truth (ADR-020) for the Week 2 Day 5 shipping-estimate request shape (week2 (1).md §10). */
export const shippingEstimateQuerySchema = z.object({
  pincode: z.string().trim().min(1, "Pincode is required"),
});
export type ShippingEstimateQuery = z.infer<typeof shippingEstimateQuerySchema>;
