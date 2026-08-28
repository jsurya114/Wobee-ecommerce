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
  /** No-op if already SENT — ProcessNotificationJobUseCase's own idempotency check happens before this is ever called, but the repository stays safe to call twice regardless. */
  markSent(id: string): Promise<void>;
  /** `payload` merge, not replace — `lastError` lands alongside the original send payload rather than losing it (DEVELOPMENT_RULES.md #8's "the DB row is the structured record" — see the entity's own comment). */
  markFailed(id: string, lastError: string): Promise<void>;
}
