/**
 * The return/refund-lifecycle emails, each tied to a real state transition
 * (2026-09-10 transactional-email build). Kept semantically distinct:
 * REFUND_INITIATED fires at RETURN_APPROVED -> REFUND_INITIATED (money not
 * yet moved); REFUND_COMPLETED fires only once the money has actually moved
 * (gateway refund succeeded, or staff confirmed a manual/COD completion).
 */
export type ReturnNotificationEventType =
  | "RETURN_REQUESTED"
  | "RETURN_APPROVED"
  | "RETURN_REJECTED"
  | "REFUND_INITIATED"
  | "REFUND_COMPLETED";

/** Narrow port for this module's dependency on the leaf `notifications` module — same shape/reasoning as this module's own AuditLoggerPort. */
export interface NotificationEnqueuerPort {
  enqueue(input: {
    userId: string | null;
    type: ReturnNotificationEventType;
    channel: "EMAIL" | "SMS" | "PUSH";
    payload: Record<string, unknown>;
  }): Promise<void>;
}
