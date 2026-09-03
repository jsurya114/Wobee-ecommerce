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

/** Week 2 Day 6 (week2 (1).md §11) — not persisted on the Return row itself (the approved schema has no rejection-reason column), only carried into the admin audit log. */
export const rejectReturnSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});
export type RejectReturnInput = z.infer<typeof rejectReturnSchema>;

export const listOrdersQuerySchema = z.object({
  status: z.enum(["PENDING_PAYMENT", "CONFIRMED", "PAYMENT_FAILED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"]).optional(),
  search: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;

/** Week 2 Day 7 (week2 (1).md §19). A query-string boolean arrives as the literal string "true"/"false" — see products.schema.ts's own `queryBooleanSchema` comment for the same footgun this avoids. */
const customerQueryBooleanSchema = z
  .enum(["true", "false"])
  .optional()
  .transform((value) => (value === undefined ? undefined : value === "true"));

export const listCustomersQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  isActive: customerQueryBooleanSchema,
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;

export const setCustomerActiveSchema = z.object({ isActive: z.boolean() });
export type SetCustomerActiveInput = z.infer<typeof setCustomerActiveSchema>;

/** Admin analytics dashboard (2026-09-03) — `days` picks the trailing window ending today; no custom from/to range in v1. */
export const adminDashboardQuerySchema = z.object({
  days: z.coerce.number().int().positive().max(90).default(30),
});
export type AdminDashboardQuery = z.infer<typeof adminDashboardQuerySchema>;
