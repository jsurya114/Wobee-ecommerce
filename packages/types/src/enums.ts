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

export const REFUND_STATUS = ["INITIATED", "COMPLETED", "FAILED"] as const;
export type RefundStatus = (typeof REFUND_STATUS)[number];

/// Week 2 Day 8 (week2 (1).md §20) — the schema's own NotificationChannel has
/// PUSH, not the spec text's "WhatsApp"; treated as authoritative the same
/// way every other schema-vs-doc-text mismatch this session has hit was
/// (the migrated schema is what's real). Only EMAIL is actually wired this
/// week — see notifications.module.ts's own comment.
export const NOTIFICATION_CHANNEL = ["EMAIL", "SMS", "PUSH"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNEL)[number];

/// SENDING is a Week 2 review fix — the atomic in-flight claim taken before the
/// provider send (PENDING -> SENDING), so a redelivered BullMQ job can't double-send.
export const NOTIFICATION_STATUS = ["PENDING", "SENDING", "SENT", "FAILED"] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUS)[number];

/// ADR-024: the four contracted roles (quotation §6). `ADMIN` from Week 1
/// Day 2 is retired here — the Prisma `Role` enum keeps it as an unused
/// legacy value (Postgres can't cheaply drop an enum value in place), but
/// this is the single source of truth every app-level role type derives
/// from, and nothing issues `ADMIN` going forward.
export const ROLE = ["CUSTOMER", "SUPER_ADMIN", "ORDER_PROCESSING_STAFF", "PRODUCT_MANAGEMENT_STAFF"] as const;
export type Role = (typeof ROLE)[number];

/// ADR-024's permission vocabulary (apps/api/src/config/permissions.ts owns
/// the role->permission MAP, which is server-only business logic; this
/// union alone is shared so apps/admin can gate nav/buttons the same way
/// (ADR-020) — client-side is a UI convenience, the server route guard is
/// what actually enforces it.
/// Client-reported business rule (2026-08-31): weight-based pricing is only
/// correct for clothing — ornaments/footwear/accessories need an admin-set
/// fixed price instead. Hard rule keyed by Category, not per-product. See
/// docs/superpowers/specs/2026-08-31-category-pricing-mode-design.md.
export const PRICING_MODE = ["WEIGHT_BASED", "FIXED"] as const;
export type PricingMode = (typeof PRICING_MODE)[number];

export const PERMISSION = [
  "MANAGE_SETTINGS",
  "MANAGE_CATALOG",
  "MANAGE_INVENTORY",
  "MANAGE_ORDERS",
  "MANAGE_STAFF",
  "MANAGE_CUSTOMERS",
] as const;
export type Permission = (typeof PERMISSION)[number];
