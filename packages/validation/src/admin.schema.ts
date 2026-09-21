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
  status: z
    .enum(["PENDING_PAYMENT", "CONFIRMED", "PAYMENT_FAILED", "PROCESSING", "PACKED", "SHIPPED", "RETURNED_TO_ORIGIN", "DELIVERED", "CANCELLED"])
    .optional(),
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

/**
 * Admin business-analytics dashboard (2026-09-21). One date selection drives
 * every panel: a preset (`today`/`7d`/`30d`/`90d`/`mtd`) or `custom` with an
 * inclusive `from`/`to` (IST calendar dates, YYYY-MM-DD). `compare` adds the
 * previous equivalent period. Replaces the old `days`-only query.
 */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), "Not a real date");
export const adminDashboardQuerySchema = z
  .object({
    range: z.enum(["today", "7d", "30d", "90d", "mtd", "custom"]).default("30d"),
    from: isoDate.optional(),
    to: isoDate.optional(),
    compare: z.enum(["previous", "none"]).default("previous"),
  })
  .superRefine((value, ctx) => {
    if (value.range !== "custom") return;
    if (!value.from || !value.to) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["from"], message: "A custom range needs both from and to." });
      return;
    }
    if (value.to < value.from) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["to"], message: "The end date is before the start date." });
    const days = (Date.parse(`${value.to}T00:00:00Z`) - Date.parse(`${value.from}T00:00:00Z`)) / 86_400_000 + 1;
    if (days > 366) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["to"], message: "The range is longer than 366 days." });
  });
export type AdminDashboardQuery = z.infer<typeof adminDashboardQuerySchema>;
