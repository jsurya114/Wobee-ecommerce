export type ReturnNotificationEventType = "RETURN_APPROVED" | "REFUND_PROCESSED";

/** Narrow port for this module's dependency on the leaf `notifications` module (Week 2 Day 8, week2 (1).md §20) — same shape/reasoning as this module's own AuditLoggerPort. */
export interface NotificationEnqueuerPort {
  enqueue(input: { userId: string | null; type: ReturnNotificationEventType; channel: "EMAIL" | "SMS" | "PUSH"; payload: Record<string, unknown> }): Promise<void>;
}
