import type { NotificationChannel, NotificationStatus } from "@woobe/types";

/**
 * The 7 "possible events" week2 (1).md §20 lists, minus a deliberate merge:
 * PAYMENT_SUCCESSFUL isn't its own type — for this system payment success
 * and order confirmation are the same instant (both `ConfirmOrderUseCase`
 * and `ConfirmCodOrderUseCase` land here), and sending two near-simultaneous
 * "your order/payment succeeded" messages for one event is spam invented on
 * top of the spec, not called for by it (see notifications.module.ts's own
 * comment for the fuller reasoning).
 */
export type NotificationEventType =
  | "ORDER_CONFIRMED"
  | "PAYMENT_FAILED"
  | "ORDER_SHIPPED"
  | "ORDER_DELIVERED"
  | "RETURN_APPROVED"
  | "REFUND_PROCESSED";

export interface NotificationEntity {
  id: string;
  userId: string | null;
  type: NotificationEventType;
  channel: NotificationChannel;
  /** Everything the provider needs to render the message — always includes `contactEmail` (EMAIL is the only wired channel; see StubEmailProvider's own comment on why). Failure detail (when status is FAILED) lives in here too, under `lastError` — DEVELOPMENT_RULES.md #8 forbids ad-hoc console.log until the real structured logger lands, so the DB row itself is the structured record. */
  payload: Record<string, unknown>;
  status: NotificationStatus;
  createdAt: Date;
  sentAt: Date | null;
}
