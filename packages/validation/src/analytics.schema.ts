import { z } from "zod";

/**
 * Public storefront analytics collector (2026-09-21). The event vocabulary is
 * CLOSED (mirrors the Prisma `AnalyticsEventType`, minus derived "paid orders"):
 * anything else is rejected, so a client can never invent event names. The
 * session id is an anonymous random UUID minted in the browser — no PII.
 */
export const ANALYTICS_EVENT_TYPES = ["SESSION_STARTED", "PRODUCT_VIEWED", "CART_ADDED", "CHECKOUT_STARTED"] as const;
export type AnalyticsEventTypeName = (typeof ANALYTICS_EVENT_TYPES)[number];

export const analyticsEventSchema = z
  .object({
    type: z.enum(ANALYTICS_EVENT_TYPES),
    sessionId: z.string().uuid(),
    /** Required for PRODUCT_VIEWED only. */
    productId: z.string().uuid().optional(),
  })
  .strict()
  .refine((event) => event.type !== "PRODUCT_VIEWED" || event.productId !== undefined, {
    message: "PRODUCT_VIEWED needs a productId.",
    path: ["productId"],
  });
export type AnalyticsEventInput = z.infer<typeof analyticsEventSchema>;
