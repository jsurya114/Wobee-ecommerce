import { z } from "zod";
import { indianPhone } from "./shared";

/**
 * Single source of truth for the checkout request shape (ADR-020) — used by
 * apps/web's checkout form and apps/api's `validate` middleware. Server-side
 * price/tax/shipping are never accepted from the client (DEVELOPMENT_RULES.md
 * #1) — this schema only carries what the checkout use-case can't compute
 * itself: who to ship to and how the customer intends to pay. Everything
 * money/weight-related is recomputed server-side from the caller's live cart.
 */

export const checkoutAddressSchema = z.object({
  fullName: z.string().trim().min(2, "Full name must be at least 2 characters").max(100),
  phone: indianPhone,
  line1: z.string().trim().min(3, "Address line 1 is required").max(200),
  line2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(2, "City is required").max(100),
  state: z.string().trim().min(2, "State is required").max(100),
  pincode: z.string().regex(/^\d{6}$/, "Enter a valid 6-digit pincode"),
});
export type CheckoutAddressInput = z.infer<typeof checkoutAddressSchema>;

export const checkoutSchema = z.object({
  contactEmail: z.string().trim().toLowerCase().email("Enter a valid email address"),
  address: checkoutAddressSchema,
  // COD's own "move straight to CONFIRMED" behavior lands Week 1 Day 5
  // alongside Razorpay's webhook-verified confirmation — Day 4 only needs
  // the method captured as part of the order's payment snapshot (Order.paymentMethod
  // is a required, non-nullable column).
  paymentMethod: z.enum(["RAZORPAY", "COD"], { errorMap: () => ({ message: "Choose a payment method" }) }),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;
