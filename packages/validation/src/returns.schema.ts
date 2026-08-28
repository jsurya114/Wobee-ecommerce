import { z } from "zod";

/** Single source of truth (ADR-020) for Week 2 Day 6's request-return shape (week2 (1).md §11). */
export const requestReturnSchema = z.object({
  orderId: z.string().uuid("Invalid order id"),
  reason: z.string().trim().min(3, "Tell us why you're returning this").max(500),
  items: z
    .array(
      z.object({
        orderItemId: z.string().uuid("Invalid order item id"),
        quantity: z.coerce.number().int().min(1, "Quantity must be at least 1"),
        reasonDetail: z.string().trim().max(500).optional(),
      }),
    )
    .min(1, "Select at least one item to return"),
});
export type RequestReturnInput = z.infer<typeof requestReturnSchema>;

/** `GET /returns?orderId=` — narrows the customer's own list to one order's returns (avoids fetching their whole return history just to render one order page). */
export const listMyReturnsQuerySchema = z.object({
  orderId: z.string().uuid().optional(),
});
export type ListMyReturnsQuery = z.infer<typeof listMyReturnsQuerySchema>;

export const RETURN_STATUS_VALUES = ["RETURN_REQUESTED", "RETURN_APPROVED", "RETURN_REJECTED", "REFUND_INITIATED", "REFUNDED"] as const;

export const listReturnsQuerySchema = z.object({
  status: z.enum(RETURN_STATUS_VALUES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListReturnsQuery = z.infer<typeof listReturnsQuerySchema>;
