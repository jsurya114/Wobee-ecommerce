import type { NotificationEntity } from "../../domain/entities/notification.entity";

/**
 * "Provider" in week2 (1).md §20's own architecture diagram (API -> domain
 * event -> BullMQ -> worker -> Provider) — the swap point for a real
 * email/SMS/WhatsApp integration once one is approved and credentialed.
 * Deliberately throws rather than returning a boolean on failure: BullMQ's
 * own retry/backoff (wired in the queue adapter) only re-attempts a job
 * whose processor threw, so "provider failed, please retry" has to be a
 * real exception, not a swallowed false.
 */
export interface NotificationProviderPort {
  send(notification: NotificationEntity): Promise<void>;
}
