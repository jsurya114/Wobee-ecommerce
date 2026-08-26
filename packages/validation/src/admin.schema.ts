import { z } from "zod";

/** Single source of truth (ADR-020) for the admin order-action request shapes — used by apps/admin's forms and apps/api's `validate` middleware. */

export const shipOrderSchema = z.object({
  trackingNumber: z.string().trim().min(1, "Tracking number is required"),
  carrier: z.string().trim().min(1, "Carrier is required"),
});
export type ShipOrderInput = z.infer<typeof shipOrderSchema>;

export const cancelOrderSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;

export const listOrdersQuerySchema = z.object({
  status: z.enum(["PENDING_PAYMENT", "CONFIRMED", "PAYMENT_FAILED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"]).optional(),
  search: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;
