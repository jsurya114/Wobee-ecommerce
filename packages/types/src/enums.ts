/**
 * Mirrors the Prisma enums in packages/database/prisma/schema.prisma.
 * Frontend apps (apps/web, apps/admin) cannot import @prisma/client
 * (ADR-019 — they never touch the database, generated or otherwise),
 * so these string-literal unions are the shared vocabulary for API
 * responses instead. Keep in sync with schema.prisma by hand — if this
 * ever drifts, apps/api's DTOs (which DO use the real Prisma enum) are
 * the source of truth to reconcile against.
 */

export const ORDER_STATUS = [
  "PENDING_PAYMENT",
  "CONFIRMED",
  "PAYMENT_FAILED",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
] as const;
export type OrderStatus = (typeof ORDER_STATUS)[number];

export const RETURN_STATUS = [
  "RETURN_REQUESTED",
  "RETURN_APPROVED",
  "RETURN_REJECTED",
  "REFUND_INITIATED",
  "REFUNDED",
] as const;
export type ReturnStatus = (typeof RETURN_STATUS)[number];

export const PAYMENT_METHOD = ["RAZORPAY", "COD"] as const;
export type PaymentMethod = (typeof PAYMENT_METHOD)[number];

export const ROLE = ["CUSTOMER", "ADMIN"] as const;
export type Role = (typeof ROLE)[number];
