import type { NotificationChannel, NotificationStatus } from "@woobe/types";

/**
 * Every customer-lifecycle email event with a real backing state
 * transition in this codebase (2026-09-10 transactional-email build).
 *
 * PAYMENT_SUCCESSFUL is deliberately NOT its own type — for this system
 * payment success and order confirmation are the same instant (both
 * `ConfirmCodOrderUseCase` and the Razorpay `payment.captured` webhook land
 * on ORDER_CONFIRMED), and a second near-simultaneous "payment received"
 * message would be spam invented on top of the spec. The ORDER_CONFIRMED
 * email carries the itemised invoice AND the payment status/method, so it
 * serves "order confirmed" + "payment received" + "invoice/receipt" as one
 * message. PAYMENT_FAILED stays its own event.
 *
 * REFUND is split into two distinct events — REFUND_INITIATED (money not
 * yet moved: the RETURN_APPROVED -> REFUND_INITIATED transition) and
 * REFUND_COMPLETED (money has moved: gateway refund succeeded, or staff
 * confirmed a manual/COD refund). The legacy REFUND_PROCESSED value is kept
 * defined for backward compatibility but is no longer emitted by any
 * use-case.
 */
export type NotificationEventType =
  | "WELCOME"
  | "PASSWORD_RESET_SUCCESS"
  | "ORDER_CONFIRMED"
  | "PAYMENT_FAILED"
  | "ORDER_SHIPPED"
  | "ORDER_DELIVERED"
  | "ORDER_CANCELLED"
  | "RETURN_REQUESTED"
  | "RETURN_APPROVED"
  | "RETURN_REJECTED"
  | "REFUND_INITIATED"
  | "REFUND_COMPLETED"
  /** @deprecated Superseded by REFUND_INITIATED / REFUND_COMPLETED. No longer emitted; retained so historical rows still type-check. */
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
