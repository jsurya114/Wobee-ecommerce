import { z } from "zod";

/**
 * Single source of truth for the payments request shapes (ADR-020, ADR-014).
 * Deliberately just an order id in both — the amount to charge is never a
 * client field; it's read server-side from the Order row created at
 * checkout (DEVELOPMENT_RULES.md #1).
 */

export const createRazorpayOrderSchema = z.object({
  orderId: z.string().uuid("Invalid order id"),
});
export type CreateRazorpayOrderInput = z.infer<typeof createRazorpayOrderSchema>;

export const confirmCodOrderSchema = z.object({
  orderId: z.string().uuid("Invalid order id"),
});
export type ConfirmCodOrderInput = z.infer<typeof confirmCodOrderSchema>;
