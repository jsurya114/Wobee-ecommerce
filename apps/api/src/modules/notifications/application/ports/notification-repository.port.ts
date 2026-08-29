import type { NotificationChannel } from "@woobe/types";
import type { NotificationEntity, NotificationEventType } from "../../domain/entities/notification.entity";

export interface CreateNotificationInput {
  userId: string | null;
  type: NotificationEventType;
  channel: NotificationChannel;
  payload: Record<string, unknown>;
}

/**
 * application depends on this interface, not on Prisma directly
 * (ARCHITECTURE.md §3.1). Owns Notification only (ADR-010).
 */
export interface NotificationRepositoryPort {
  create(input: CreateNotificationInput): Promise<NotificationEntity>;
  findById(id: string): Promise<NotificationEntity | null>;
  /**
   * Week 2 review fix (P1) — atomic in-flight claim: a conditional
   * `UPDATE ... SET status = 'SENDING' WHERE id = ? AND status = 'PENDING'`.
   * Returns true only for the caller that won the transition. Taken BEFORE
   * the provider send so a BullMQ redelivery / a second worker / a retry
   * after a lost completion-ack can never fire the same message twice.
   */
  claimForSending(id: string): Promise<boolean>;
  /** Releases a claim back to PENDING (`... WHERE id = ? AND status = 'SENDING'`) after a retryable send failure, so BullMQ's own retry can re-attempt it. */
  releaseClaim(id: string): Promise<void>;
  /** SENDING -> SENT. Guarded so it only advances a row this worker actually claimed. */
  markSent(id: string): Promise<void>;
  /** Non-terminal (`PENDING`/`SENDING`) -> FAILED. `payload` merge, not replace — `lastError` lands alongside the original send payload rather than losing it (DEVELOPMENT_RULES.md #8's "the DB row is the structured record"). Guarded so it can never clobber a row that already reached SENT. */
  markFailed(id: string, lastError: string): Promise<void>;
}
